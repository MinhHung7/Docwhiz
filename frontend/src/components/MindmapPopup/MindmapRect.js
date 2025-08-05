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

    function update(source) {
      const nodes = root.descendants();
      const links = nodes.slice(1);

      tree.size([Math.max(500, nodes.length * 50), width - 200]);
      const treeData = tree(root);
      const newNodes = treeData.descendants();

      newNodes.forEach((d) => (d.y = d.depth * 220)); // Tăng khoảng cách để có chỗ cho thẻ chữ nhật

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

      // Thêm text trực tiếp vào node thay vì dùng foreignObject
      nodeEnter
        .append("text")
        .attr("dy", "0.35em")
        .attr("text-anchor", "middle")
        .style("font-size", "12px")
        .style("fill", "#333")
        .style("font-weight", "500")
        .text((d) => {
          const maxLength = d.depth === 0 ? 12 : 10;
          return d.data.name.length > maxLength
            ? d.data.name.substring(0, maxLength) + "..."
            : d.data.name;
        });

      const nodeUpdate = nodeEnter.merge(node);

      nodeUpdate
        .transition()
        .duration(duration)
        .attr("transform", (d) => `translate(${d.y},${d.x})`);

      // Cập nhật kích thước và màu sắc của hình chữ nhật
      nodeUpdate
        .select("rect")
        .transition()
        .duration(duration)
        .attr("width", (d) => {
          if (d.depth === 0) return 120;
          return d._children ? 100 : 90;
        })
        .attr("height", (d) => {
          if (d.depth === 0) return 50;
          return d._children ? 40 : 35;
        })
        .attr("x", (d) => {
          if (d.depth === 0) return -60;
          return d._children ? -50 : -45;
        })
        .attr("y", (d) => {
          if (d.depth === 0) return -25;
          return d._children ? -20 : -17.5;
        })
        .style("fill", (d) => {
          if (d.depth === 0) return "#ff6b6b";
          return d._children ? "#ffa726" : "#ffffff";
        })
        .style("stroke", (d) => {
          if (d.depth === 0) return "#ff4757";
          return d._children ? "#ff9800" : "#4a90e2";
        })
        .style("stroke-width", (d) => (d.depth === 0 ? 3 : 2))
        .attr("class", (d) => {
          if (d.depth === 0) return "root-node";
          return d._children ? "collapsed-node" : "expanded-node";
        });

      // Cập nhật text
      nodeUpdate
        .select("text")
        .transition()
        .duration(duration)
        .style("fill", (d) => (d.depth === 0 ? "#fff" : "#333"))
        .style("font-size", (d) => (d.depth === 0 ? "14px" : "12px"))
        .style("font-weight", (d) => (d.depth === 0 ? "600" : "500"))
        .text((d) => {
          const maxLength = d.depth === 0 ? 12 : 10;
          return d.data.name.length > maxLength
            ? d.data.name.substring(0, maxLength) + "..."
            : d.data.name;
        });

      const nodeExit = node
        .exit()
        .transition()
        .duration(duration)
        .attr("transform", (d) => `translate(${source.y},${source.x})`)
        .remove();

      nodeExit.select("rect").attr("width", 1e-6).attr("height", 1e-6);
      nodeExit.select("text").style("fill-opacity", 1e-6);

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
          <h2>🧠 Mind Map Viewer</h2>
          <button className="close-btn" onClick={onClose}>
            ✖
          </button>
        </div>
        <svg ref={svgRef} className="mindmap-canvas" id="mindmap">
          <g ref={gRef}></g>
        </svg>
        <div ref={tooltipRef} id="tooltip" className="tooltip"></div>
        <div
          ref={cardRef}
          id="contentCard"
          className="content-card"
          onMouseEnter={() => setHoveringCard(true)}
          onMouseLeave={() => setHoveringCard(false)}
        ></div>
      </div>
    </div>,
    document.getElementById("popup-root")
  );
};

export default MindMapPopup;
