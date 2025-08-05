import React, { useEffect, useRef, useState } from "react";
import * as d3 from "d3";
import ReactDOM from "react-dom";
import "./MindmapPopup.css";

const MindMapPopup = ({ jsonData, onClose }) => {
  const svgRef = useRef(null);
  const gRef = useRef(null);
  const cardRef = useRef(null);
  const tooltipRef = useRef(null);
  const [hoveringNode, setHoveringNode] = useState(false);
  const [hoveringCard, setHoveringCard] = useState(false);
  const [cardTimeout, setCardTimeout] = useState(null);
  const zoomRef = useRef(null);

  useEffect(() => {
    if (!jsonData) return;

    let width = window.innerWidth - 40;
    let height = window.innerHeight - 200;
    let i = 0;
    let duration = 750;
    let root, tree;
    let zoomEnabled = true;

    const svg = d3
      .select(svgRef.current)
      .attr("width", width)
      .attr("height", height);

    const g = d3.select(gRef.current);

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
      });

    svg.call(zoom);
    zoomRef.current = zoom;

    tree = d3.tree().size([width - 200, height - 100]);

    root = d3.hierarchy(jsonData);
    root.x0 = width / 2;
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

    function update(source) {
      const nodes = root.descendants();
      const links = nodes.slice(1);

      // Tính toán layout cơ bản
      tree.size([Math.max(500, nodes.length * 80), height - 100]);
      const treeData = tree(root);
      const newNodes = treeData.descendants();

      newNodes.forEach((d) => (d.y = d.depth * 280));

      // Hàm tính toán kích thước node dựa trên nội dung
      function calculateNodeSize(d) {
        const name = d.data.name || "";
        const content = d.data.content || "";

        if (d.depth === 0) {
          return { width: 140, height: 50 };
        }

        const nameLength = name.length;
        const contentLength = content.length;

        const minWidth = 120;
        const maxWidth = 250;

        const maxTextLength = Math.max(nameLength, contentLength);
        let width = Math.max(
          minWidth,
          Math.min(maxWidth, maxTextLength * 6 + 40)
        );

        let height = 40;

        if (content) {
          const charsPerLine = Math.floor((width - 20) / 6);
          const contentLines = Math.ceil(contentLength / charsPerLine);
          height += contentLines * 16 + 8;
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

          const currentRight = current.x + current.nodeWidth / 2;
          const nextLeft = next.x - next.nodeWidth / 2;

          const minGap = 20; // Khoảng cách tối thiểu giữa các node

          if (currentRight + minGap > nextLeft) {
            const overlap = currentRight + minGap - nextLeft;

            // Di chuyển các node phía bên phải sang phải
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
        .attr("transform", (d) => `translate(${source.x0},${source.y0})`)
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
        .attr("transform", (d) => `translate(${d.x},${d.y})`);

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
        .attr("transform", (d) => `translate(${source.x},${source.y})`)
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
    }

    function diagonal(s, d) {
      return `M ${s.x} ${s.y} C ${s.x} ${(s.y + d.y) / 2}, ${d.x} ${
        (s.y + d.y) / 2
      }, ${d.x} ${d.y}`;
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

    // Zoom functions
    function zoomIn() {
      svg
        .transition()
        .duration(zoomConfig.duration)
        .call(zoom.scaleBy, zoomConfig.speed);
    }

    function zoomOut() {
      svg
        .transition()
        .duration(zoomConfig.duration)
        .call(zoom.scaleBy, 1 / zoomConfig.speed);
    }

    function resetView() {
      svg
        .transition()
        .duration(zoomConfig.resetDuration)
        .call(zoom.transform, d3.zoomIdentity);
    }

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
    };
  }, [jsonData]);

  return ReactDOM.createPortal(
    <div className="mindmap-overlay">
      <div className="mindmap-container">
        <div className="popup-header">
          <h2>Mind Map Viewer</h2>
          <button className="close-btn" onClick={onClose}>
            ✖
          </button>
        </div>
        <svg ref={svgRef} className="mindmap-canvas" id="mindmap">
          <g ref={gRef}></g>
        </svg>
        <div ref={tooltipRef} id="tooltip" className="tooltip"></div>
      </div>
    </div>,
    document.getElementById("popup-root")
  );
};

export default MindMapPopup;
