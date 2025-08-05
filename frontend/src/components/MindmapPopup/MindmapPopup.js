import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import ReactDOM from "react-dom";
import "./MindmapPopup.css";

const MindMapPopup = ({ jsonData, onClose }) => {
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const miniMapRef = useRef(null);
  const miniMapGRef = useRef(null);
  const viewBoxRef = useRef(null);
  const cardRef = useRef(null);
  const tooltipRef = useRef(null);
  const [hoveringNode, setHoveringNode] = useState(false);
  const [hoveringCard, setHoveringCard] = useState(false);
  const [cardTimeout, setCardTimeout] = useState(null);
  const zoomRef = useRef(null);
  const treeDataRef = useRef(null);

  useEffect(() => {
    if (!jsonData) return;

    let width = window.innerWidth - 40;
    let height = window.innerHeight - 200;
    let i = 0;
    let duration = 750;
    let root, tree;
    let zoomEnabled = true;

    // Mini-map dimensions
    const miniMapWidth = 200;
    const miniMapHeight = 150;

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    const g = d3.select(gRef.current);

    // Setup mini-map
    const miniMapSvg = d3
      .select(miniMapRef.current)
      .attr("width", miniMapWidth)
      .attr("height", miniMapHeight);

    const miniMapG = d3.select(miniMapGRef.current);

    // Add glow filter for viewport
    const defs = miniMapSvg.append("defs");

    const glowFilter = defs
      .append("filter")
      .attr("id", "glow")
      .attr("x", "-50%")
      .attr("y", "-50%")
      .attr("width", "200%")
      .attr("height", "200%");

    glowFilter
      .append("feGaussianBlur")
      .attr("stdDeviation", "3")
      .attr("result", "coloredBlur");

    const feMerge = glowFilter.append("feMerge");
    feMerge.append("feMergeNode").attr("in", "coloredBlur");
    feMerge.append("feMergeNode").attr("in", "SourceGraphic");

    // Create viewport rectangle for mini-map
    const viewBox = miniMapSvg
      .append("rect")
      .attr("class", "viewport")
      .style("fill", "rgba(0, 212, 255, 0.15)")
      .style("stroke", "#00d4ff")
      .style("stroke-width", 2)
      .style("cursor", "move")
      .style("filter", "url(#glow)")
      .style("rx", 4)
      .style("ry", 4);

    viewBoxRef.current = viewBox;

    const gradient = svg
      .append("defs")
      .append("linearGradient")
      .attr("id", "nodeGradient")
      .attr("x1", "0%")
      .attr("y1", "0%")
      .attr("x2", "100%")
      .attr("y2", "100%");

    gradient.append("stop").attr("offset", "0%").attr("stop-color", "#4a90e2");
    gradient
      .append("stop")
      .attr("offset", "100%")
      .attr("stop-color", "#357abd");

    const zoom = d3
      .zoom()
      .scaleExtent([0.1, 5])
      .on("zoom", (event) => {
        g.attr("transform", event.transform);
        updateMiniMapViewport(event.transform);
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    tree = d3.tree().size([height - 100, width - 200]);

    root = d3.hierarchy(jsonData);
    root.x0 = height / 2;
    root.y0 = 0;

    if (root.children) root.children.forEach(collapse);

    update(root);

    function collapse(d) {
      if (d.children) {
        d._children = d.children;
        d._children.forEach(collapse);
        d.children = null;
      }
    }

    function updateMiniMapViewport(transform) {
      if (!treeDataRef.current) return;

      const bounds = getBounds(treeDataRef.current);
      const scale = Math.min(
        miniMapWidth / bounds.width,
        miniMapHeight / bounds.height
      );

      // Calculate viewport position and size in mini-map coordinates
      const viewportWidth = (width / transform.k) * scale;
      const viewportHeight = (height / transform.k) * scale;

      const viewportX = (-transform.x / transform.k) * scale;
      const viewportY = (-transform.y / transform.k) * scale;

      viewBox
        .attr("x", viewportX)
        .attr("y", viewportY)
        .attr("width", viewportWidth)
        .attr("height", viewportHeight);
    }

    function getBounds(nodes) {
      let minX = Infinity,
        maxX = -Infinity;
      let minY = Infinity,
        maxY = -Infinity;

      nodes.forEach((d) => {
        const halfWidth = d.nodeWidth ? d.nodeWidth / 2 : 50;
        const halfHeight = d.nodeHeight ? d.nodeHeight / 2 : 25;

        minX = Math.min(minX, d.y - halfWidth);
        maxX = Math.max(maxX, d.y + halfWidth);
        minY = Math.min(minY, d.x - halfHeight);
        maxY = Math.max(maxY, d.x + halfHeight);
      });

      return {
        x: minX,
        y: minY,
        width: maxX - minX,
        height: maxY - minY,
      };
    }

    function updateMiniMap(nodes) {
      if (!nodes || nodes.length === 0) return;

      treeDataRef.current = nodes;
      const bounds = getBounds(nodes);

      // Calculate scale to fit the entire tree in mini-map
      const scale =
        Math.min(miniMapWidth / bounds.width, miniMapHeight / bounds.height) *
        0.9; // Add some padding

      // Clear previous mini-map content
      miniMapG.selectAll("*").remove();

      // Draw mini-map nodes
      const miniNodes = miniMapG
        .selectAll("circle")
        .data(nodes)
        .enter()
        .append("circle")
        .attr("cx", (d) => (d.y - bounds.x) * scale)
        .attr("cy", (d) => (d.x - bounds.y) * scale)
        .attr("r", 3)
        .style("fill", (d) => {
          if (d.depth === 0) return "#4f46e5";
          return d._children ? "#f59e0b" : "#6b7280";
        })
        .style("stroke", "#fff")
        .style("stroke-width", 1);

      // Draw mini-map links
      const links = nodes.slice(1);
      miniMapG
        .selectAll("line")
        .data(links)
        .enter()
        .append("line")
        .attr("x1", (d) => (d.parent.y - bounds.x) * scale)
        .attr("y1", (d) => (d.parent.x - bounds.y) * scale)
        .attr("x2", (d) => (d.y - bounds.x) * scale)
        .attr("y2", (d) => (d.x - bounds.y) * scale)
        .style("stroke", "#ccc")
        .style("stroke-width", 1);

      // Update viewport
      const currentTransform = d3.zoomTransform(svg.node());
      updateMiniMapViewport(currentTransform);
    }

    // Add drag behavior to viewport rectangle
    const drag = d3.drag().on("drag", function (event) {
      if (!treeDataRef.current) return;

      const bounds = getBounds(treeDataRef.current);
      const scale =
        Math.min(miniMapWidth / bounds.width, miniMapHeight / bounds.height) *
        0.9;

      // Convert mini-map coordinates back to main map coordinates
      const newX = -(event.x / scale) * zoomRef.current.scaleExtent()[1];
      const newY = -(event.y / scale) * zoomRef.current.scaleExtent()[1];

      const currentTransform = d3.zoomTransform(svg.node());
      const newTransform = d3.zoomIdentity
        .translate(newX, newY)
        .scale(currentTransform.k);

      svg
        .transition()
        .duration(200)
        .call(zoomRef.current.transform, newTransform);
    });

    viewBox.call(drag);

    function update(source) {
      const nodes = root.descendants();
      const links = nodes.slice(1);

      // Tính toán layout cơ bản
      tree.size([Math.max(500, nodes.length * 80), width - 200]);
      const treeData = tree(root);
      const newNodes = treeData.descendants();

      newNodes.forEach((d) => (d.y = d.depth * 280));

      // Hàm tính toán kích thước node dựa trên nội dung
      function calculateNodeSize(d) {
        const name = d.data.name || "";
        const content = d.data.content || "";

        const nameLength = name.length;
        const contentLength = content.length;

        const minWidth = 120;
        const maxWidth = 250;

        const maxTextLength = Math.max(nameLength, contentLength);
        let width = Math.max(
          minWidth,
          Math.min(maxWidth, maxTextLength * 6 + 40)
        );

        // Tính height dựa trên số dòng tên (name)
        const charsPerLineName = Math.floor((width - 20) / 6);
        const nameLines = Math.ceil(nameLength / charsPerLineName);
        let height = nameLines * 18 + 18; // padding trên dưới

        if (content) {
          const charsPerLine = Math.floor((width - 20) / 6);
          const contentLines = Math.ceil(contentLength / charsPerLine);
          height += contentLines * 12 + 12;
        }

        return { width, height };
      }

      // Gán kích thước cho mỗi node
      newNodes.forEach((d) => {
        const size = calculateNodeSize(d);
        d.nodeWidth = size.width;
        d.nodeHeight = size.height;
      });

      // Collision detection và adjustment cho mỗi level
      const nodesByDepth = d3.group(newNodes, (d) => d.depth);

      nodesByDepth.forEach((nodesAtDepth, depth) => {
        if (nodesAtDepth.length <= 1) return;

        // Sắp xếp theo vị trí x
        nodesAtDepth.sort((a, b) => a.x - b.x);

        // Điều chỉnh vị trí để tránh collision
        for (let i = 0; i < nodesAtDepth.length - 1; i++) {
          const current = nodesAtDepth[i];
          const next = nodesAtDepth[i + 1];

          const currentBottom = current.x + current.nodeHeight / 2;
          const nextTop = next.x - next.nodeHeight / 2;

          const minGap = 20; // Khoảng cách tối thiểu giữa các node

          if (currentBottom + minGap > nextTop) {
            const overlap = currentBottom + minGap - nextTop;

            // Di chuyển các node phía dưới xuống
            for (let j = i + 1; j < nodesAtDepth.length; j++) {
              nodesAtDepth[j].x += overlap;
            }
          }
        }
      });

      const node = g
        .selectAll("g.node")
        .data(newNodes, (d) => d.id || (d.id = ++i));

      const nodeEnter = node
        .enter()
        .append("g")
        .attr("class", "node")
        .attr("transform", (d) => `translate(${source.y0},${source.x0})`)
        .on("click", (event, d) => {
          if (d.children) {
            d._children = d.children;
            d.children = null;
          } else {
            d.children = d._children;
            d._children = null;
          }
          update(d);
        })
        .on("mouseenter", (event, d) => {
          if (cardTimeout) clearTimeout(cardTimeout);
          setHoveringNode(true);
          showTooltip(event, d);
        })
        .on("mouseleave", () => {
          setHoveringNode(false);
          if (cardTimeout) clearTimeout(cardTimeout);
          const timeout = setTimeout(() => {
            if (!hoveringNode && !hoveringCard) hideTooltip();
          }, 3000);
          setCardTimeout(timeout);
        });

      // Thay đổi từ circle sang rect (hình chữ nhật)
      nodeEnter
        .append("rect")
        .attr("width", 1e-6)
        .attr("height", 1e-6)
        .attr("x", 0)
        .attr("y", 0)
        .attr("rx", 8) // Bo góc
        .attr("ry", 8)
        .style("fill", (d) => (d._children ? "#ffa726" : "#ffffff"))
        .style("stroke", "#4a90e2")
        .style("stroke-width", 2);

      // Sử dụng foreignObject để hiển thị nội dung với khả năng xuống dòng
      nodeEnter
        .append("foreignObject")
        .attr("width", 1)
        .attr("height", 1)
        .attr("x", 0)
        .attr("y", 0)
        .append("xhtml:div")
        .style("padding", "8px")
        .style("font-family", "system-ui, -apple-system, sans-serif")
        .style("font-size", "12px")
        .style("line-height", "1.4")
        .style("color", "#333")
        .style("text-align", "left")
        .style("word-wrap", "break-word")
        .style("hyphens", "auto")
        .html((d) => {
          const name = d.data.name || "";
          const content = d.data.content || "";

          if (d.depth === 0) {
            // Root node: chỉ hiển thị tên với icon
            return `<div style="font-weight: 600; font-size: 14px; color: white; text-align: center;">
              ✦ ${name}
            </div>`;
          } else {
            // Các node khác: hiển thị tên và nội dung
            let html = `<div style="font-weight: 600; margin-bottom: 4px; color: #333;">
              ${name}
            </div>`;

            if (content) {
              html += `<div style="font-size: 11px; color: #666; line-height: 1.3;">
                ${content}
              </div>`;
            }

            return html;
          }
        });

      const nodeUpdate = nodeEnter.merge(node);

      nodeUpdate
        .transition()
        .duration(duration)
        .attr("transform", (d) => `translate(${d.y},${d.x})`);

      // Hàm tính toán kích thước node dựa trên nội dung (đã được định nghĩa ở trên)
      function getNodeSize(d) {
        return { width: d.nodeWidth, height: d.nodeHeight };
      }

      // Cập nhật kích thước và màu sắc của hình chữ nhật
      nodeUpdate
        .select("rect")
        .transition()
        .duration(duration)
        .attr("width", (d) => getNodeSize(d).width)
        .attr("height", (d) => getNodeSize(d).height)
        .attr("x", (d) => -getNodeSize(d).width / 2)
        .attr("y", (d) => -getNodeSize(d).height / 2)
        .style("fill", (d) => {
          if (d.depth === 0) return "#4f46e5"; // Indigo cho root
          return d._children ? "#f59e0b" : "#ffffff"; // Amber cho collapsed, white cho expanded
        })
        .style("stroke", (d) => {
          if (d.depth === 0) return "#3730a3";
          return d._children ? "#d97706" : "#6b7280";
        })
        .style("stroke-width", (d) => (d.depth === 0 ? 2 : 1))
        .style("box-shadow", "0 2px 8px rgba(0,0,0,0.1)")
        .attr("class", (d) => {
          if (d.depth === 0) return "root-node";
          return d._children ? "collapsed-node" : "expanded-node";
        });

      // Cập nhật foreignObject
      nodeUpdate
        .select("foreignObject")
        .transition()
        .duration(duration)
        .attr("width", (d) => getNodeSize(d).width)
        .attr("height", (d) => getNodeSize(d).height)
        .attr("x", (d) => -getNodeSize(d).width / 2)
        .attr("y", (d) => -getNodeSize(d).height / 2);

      const nodeExit = node
        .exit()
        .transition()
        .duration(duration)
        .attr("transform", (d) => `translate(${source.y},${source.x})`)
        .remove();

      nodeExit.select("rect").attr("width", 1e-6).attr("height", 1e-6);
      nodeExit.select("foreignObject").attr("width", 1e-6).attr("height", 1e-6);

      const link = g.selectAll("path.link").data(links, (d) => d.id);

      link
        .enter()
        .insert("path", "g")
        .attr("class", "link")
        .attr("d", (d) => diagonal(source, source))
        .merge(link)
        .transition()
        .duration(duration)
        .attr("d", (d) => diagonal(d, d.parent));

      link.exit().remove();

      nodes.forEach((d) => {
        d.x0 = d.x;
        d.y0 = d.y;
      });

      // Update mini-map after main update
      updateMiniMap(newNodes);
    }

    function diagonal(s, d) {
      return `M ${s.y} ${s.x} C ${(s.y + d.y) / 2} ${s.x}, ${(s.y + d.y) / 2} ${
        d.x
      }, ${d.y} ${d.x}`;
    }

    function showTooltip(event, d) {
      const tooltip = tooltipRef.current;
      const card = cardRef.current;

      if (!tooltip || !card) return;

      if (d.data.content) {
        card.innerHTML = `<h3>${d.data.name}</h3><p>${d.data.content}</p>`;
        card.style.display = "block";
        const cardWidth = 300;
        const x = event.pageX + 20;
        const y = event.pageY - 20;
        const rightEdge = window.innerWidth - cardWidth - 20;
        card.style.left =
          (x > rightEdge ? event.pageX - cardWidth - 20 : x) + "px";
        card.style.top = y + "px";
        tooltip.style.opacity = 0;
      } else {
        tooltip.innerHTML = `<strong>${d.data.name}</strong><br>Level: ${
          d.depth
        }<br>Children: ${
          d.children ? d.children.length : d._children ? d._children.length : 0
        }`;
        tooltip.style.left = event.pageX + 10 + "px";
        tooltip.style.top = event.pageY - 10 + "px";
        tooltip.style.opacity = 1;
        card.style.display = "none";
      }
    }

    function hideTooltip() {
      if (tooltipRef.current) tooltipRef.current.style.opacity = 0;
      if (cardRef.current) cardRef.current.style.display = "none";
    }

    // Zoom configuration
    const zoomConfig = {
      speed: 1.3,
      duration: 200,
      wheelSpeed: 0.002,
      resetDuration: 500,
    };

    // Check if mouse is over content card
    function isMouseOverCard(event) {
      const card = document.getElementById("contentCard");
      if (!card) return false;
      const rect = card.getBoundingClientRect();
      return (
        event.clientX >= rect.left &&
        event.clientX <= rect.right &&
        event.clientY >= rect.top &&
        event.clientY <= rect.bottom
      );
    }

    // Listen to mouse move globally
    const handleMouseMove = (event) => {
      if (isMouseOverCard(event)) {
        setHoveringCard(true);
        if (cardTimeout) clearTimeout(cardTimeout);
      } else {
        setHoveringCard(false);
        if (!hoveringCard) {
          if (cardTimeout) clearTimeout(cardTimeout);
          const timeout = setTimeout(() => {
            hideTooltip();
          }, 500);
          setCardTimeout(timeout);
        }
      }
    };

    document.addEventListener("mousemove", handleMouseMove);

    // Initialize on page load
    document.addEventListener("DOMContentLoaded", () => {
      const contentCard = document.getElementById("contentCard");
      if (contentCard) {
        contentCard.addEventListener("wheel", function (e) {
          e.stopImmediatePropagation();
        });

        contentCard.addEventListener("mouseenter", () => {
          zoomEnabled = false;
        });

        contentCard.addEventListener("mouseleave", () => {
          zoomEnabled = true;
        });
      }
    });

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      d3.select(svgRef.current).selectAll("*").remove();
      d3.select(miniMapRef.current).selectAll("*").remove();
    };
  }, [jsonData]);

  const zoomBtnStyle = {
    background: "#212121",
    color: "#f8fafc",
    border: "1px solid rgba(255, 255, 255, 0.1)",
    borderRadius: "8px",
    padding: "6px 10px",
    fontSize: "14px",
    cursor: "pointer",
    // backdropFilter: "blur(6px)",
    // boxShadow: "0 4px 12px rgba(0,0,0,0.4)",
    transition: "all 0.2s ease",
  };

  return ReactDOM.createPortal(
    <div className="mindmap-overlay">
      <div className="mindmap-container">
        <div className="popup-header">
          <div className="popup-header-title">
            <img
              src="/assets/logo.png"
              alt="Mind Map Icon"
              className="mindmap-icon"
            />
            <h2>Mind Map</h2>
          </div>
          <button className="close-btn" onClick={onClose}>
            ✖
          </button>
        </div>
        {/* Zoom Controls */}
        <div
          className="zoom-controls"
          style={{
            position: "absolute",
            top: "16px",
            right: "80px",
            display: "flex",
            gap: "8px",
            zIndex: 1001,
          }}
        >
          <button
            style={zoomBtnStyle}
            onClick={() => {
              d3.select(svgRef.current)
                .transition()
                .call(zoomRef.current.scaleBy, 1.2);
            }}
            title="Zoom In"
          >
            ＋
          </button>
          <button
            style={zoomBtnStyle}
            onClick={() => {
              d3.select(svgRef.current)
                .transition()
                .call(zoomRef.current.scaleBy, 0.8);
            }}
            title="Zoom Out"
          >
            －
          </button>
          <button
            style={zoomBtnStyle}
            onClick={() => {
              d3.select(svgRef.current)
                .transition()
                .duration(400)
                .call(zoomRef.current.transform, d3.zoomIdentity);
            }}
            title="Reset Zoom"
          >
            ⟳
          </button>
        </div>

        <svg ref={svgRef} className="mindmap-canvas" id="mindmap">
          <g ref={gRef}></g>
        </svg>

        {/* Mini-map */}
        <div
          className="minimap-container"
          style={{
            position: "absolute",
            bottom: "20px",
            right: "20px",
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            borderRadius: "12px",
            boxShadow:
              "0 8px 32px rgba(0, 0, 0, 0.3), 0 0 0 1px rgba(255, 255, 255, 0.05)",
            padding: "12px",
            zIndex: 1000,
            backdropFilter: "blur(10px)",
            transition: "all 0.3s ease",
          }}
        >
          <div
            style={{
              fontSize: "11px",
              fontWeight: "600",
              color: "#a8b3cf",
              marginBottom: "8px",
              textAlign: "center",
              textTransform: "uppercase",
              letterSpacing: "0.5px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "6px",
            }}
          >
            <span
              style={{
                width: "4px",
                height: "4px",
                background: "linear-gradient(45deg, #00d4ff, #0099cc)",
                borderRadius: "50%",
                animation: "pulse 2s infinite",
              }}
            ></span>
            Navigation
          </div>
          <svg
            ref={miniMapRef}
            className="minimap-canvas"
            style={{
              borderRadius: "6px",
              background: "linear-gradient(135deg, #0f0f23 0%, #1a1a2e 100%)",
              border: "1px solid rgba(255, 255, 255, 0.08)",
            }}
          >
            <g ref={miniMapGRef}></g>
          </svg>
        </div>

        {/* Add pulse animation */}
        <style>{`
          @keyframes pulse {
            0%, 100% { opacity: 1; transform: scale(1); }
            50% { opacity: 0.7; transform: scale(1.2); }
          }
          
          @keyframes miniPulse {
            0%, 100% { 
              opacity: 0; 
              transform: scale(1); 
            }
            50% { 
              opacity: 0.6; 
              transform: scale(1.5); 
            }
          }
          
          .minimap-container:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 40px rgba(0, 0, 0, 0.4), 0 0 0 1px rgba(255, 255, 255, 0.1) !important;
          }
          
          .mini-node:hover circle:first-of-type {
            transform: scale(1.1);
            transition: transform 0.2s ease;
          }
        `}</style>

        <div
          ref={tooltipRef}
          id="tooltip"
          className="tooltip"
          style={{
            position: "absolute",
            background: "linear-gradient(135deg, #1a1a2e 0%, #16213e 100%)",
            color: "#e2e8f0",
            padding: "8px 12px",
            borderRadius: "8px",
            border: "1px solid rgba(255, 255, 255, 0.1)",
            fontSize: "12px",
            pointerEvents: "none",
            opacity: 0,
            transition: "opacity 0.2s ease",
            backdropFilter: "blur(10px)",
            boxShadow: "0 4px 16px rgba(0, 0, 0, 0.3)",
            zIndex: 1002,
          }}
        ></div>
      </div>
    </div>,
    document.getElementById("popup-root")
  );
};

export default MindMapPopup;
