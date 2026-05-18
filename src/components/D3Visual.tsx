import React, { useEffect, useRef } from 'react';
import * as d3 from 'd3';

interface D3VisualProps {
  data: any[];
  config: {
    type: 'force' | 'network' | 'chord' | 'arc' | 'radial' | 'spider' | 'pack' | 'circle-pack' | 'treemap' | 'tree' | 'dendrogram' | 'sankey' | 'hierarchy' | 'heatmap' | 'calendar' | 'matrix' | 'dot-plot' | 'swarm' | 'distribution' | string;
    title: string;
    xAxisField?: string;
    yAxisField?: string;
    color?: string;
    groupField?: string;
    sizeField?: string;
  };
}

export function D3Visual({ data, config }: D3VisualProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!containerRef.current || !tooltipRef.current || !data || data.length === 0) return;
    const container = containerRef.current;
    const tooltip = d3.select(tooltipRef.current);
    
    // Clear previous SVG
    d3.select(container).selectAll("svg").remove();
    
    const width = container.clientWidth;
    const height = container.clientHeight || 300;
    
    const svg = d3.select(container)
      .append("svg")
      .attr("width", width)
      .attr("height", height)
      .attr("viewBox", `0 0 ${width} ${height}`)
      .attr("style", "max-width: 100%; height: auto;");

    // Tooltip helper
    const showTooltip = (event: any, text: string) => {
       tooltip.style("opacity", 1)
              .html(String(text).replace(/\n/g, '<br/>'))
              .style("left", (event.clientX + 10) + "px")
              .style("top", (event.clientY - 28) + "px");
    };
    const hideTooltip = () => {
       tooltip.style("opacity", 0);
    };

    // Render logic per type
    if (['force', 'network', 'chord', 'arc'].includes(config.type)) {
      const g = svg.append("g").attr("transform", `translate(${width/2},${height/2})`);
      const nodes = data.map(d => Object.create(d));
      
      const simulation = d3.forceSimulation(nodes)
        .force("charge", d3.forceManyBody().strength(-30))
        .force("collide", d3.forceCollide().radius(d => {
            const val = config.sizeField ? d[config.sizeField] : 10;
            return Math.max(5, Math.min(20, Number(val) || 10));
        }))
        .force("x", d3.forceX())
        .force("y", d3.forceY());
        
      const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
      
      const node = g.append("g")
        .selectAll("circle")
        .data(nodes)
        .join("circle")
        .attr("r", d => {
            const val = config.sizeField ? d[config.sizeField] : 10;
            return Math.max(5, Math.min(20, Number(val) || 10));
        })
        .attr("fill", d => config.groupField ? colorScale(d[config.groupField]) : (config.color || "#3b82f6"))
        .attr("opacity", 0.8)
        .attr("stroke", "#181b21")
        .attr("stroke-width", 1.5)
        .on("mouseover", function(event, d) {
             d3.select(this).attr("stroke", "#fff").attr("stroke-width", 2.5);
             const text = Object.entries(d)
                .filter(([k,v]) => typeof v !== 'object' && !['index', 'x', 'y', 'vy', 'vx'].includes(k))
                .map(([k,v]) => `<strong>${k}</strong>: ${v}`).join('\n');
             showTooltip(event, text);
        })
        .on("mousemove", function(event) {
             tooltip.style("left", (event.clientX + 10) + "px")
                    .style("top", (event.clientY - 28) + "px");
        })
        .on("mouseout", function(event, d) {
             d3.select(this).attr("stroke", "#181b21").attr("stroke-width", 1.5);
             hideTooltip();
        });
        
      simulation.on("tick", () => {
        node
          .attr("cx", d => d.x)
          .attr("cy", d => d.y);
      });
    } else if (['pack', 'circle-pack', 'treemap'].includes(config.type)) {
        const root = d3.hierarchy({ children: data })
          .sum(d => config.sizeField ? d[config.sizeField] : 1);
          
        d3.pack()
          .size([width - 20, height - 20])
          .padding(3)(root as any);
          
        const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
        
        svg.append("g")
           .attr("transform", "translate(10,10)")
           .selectAll("circle")
           .data(root.leaves())
           .join("circle")
           .attr("cx", (d: any) => d.x)
           .attr("cy", (d: any) => d.y)
           .attr("r", (d: any) => d.r)
           .attr("fill", (d: any) => config.groupField ? colorScale(d.data[config.groupField]) : (config.color || "#8b5cf6"))
           .attr("opacity", 0.7)
           .on("mouseover", function(event, d: any) {
                d3.select(this).attr("stroke", "#333").attr("stroke-width", 2);
                const text = Object.entries(d.data)
                   .filter(([k,v]) => typeof v !== 'object')
                   .map(([k,v]) => `<strong>${k}</strong>: ${v}`).join('\n');
                showTooltip(event, text !== '' ? text : `<strong>Value</strong>: ${d.value}`);
           })
           .on("mousemove", function(event) {
                tooltip.style("left", (event.clientX + 10) + "px")
                       .style("top", (event.clientY - 28) + "px");
           })
           .on("mouseout", function() {
                d3.select(this).attr("stroke", null);
                hideTooltip();
           });
    } else if (['tree', 'dendrogram', 'sankey', 'hierarchy', 'radial', 'spider'].includes(config.type)) {
        const rootGroup = { name: config.title || 'Root', children: [] as any[] };
        
        if (config.groupField) {
            const groups = d3.group(data, d => String(d[config.groupField!]));
            rootGroup.children = Array.from(groups, ([key, values]) => ({
                name: key,
                children: values.map(v => ({...v, name: v[config.xAxisField || Object.keys(v)[0]]}))
            }));
        } else {
             rootGroup.children = data.map(v => ({...v, name: v[config.xAxisField || Object.keys(v)[0]]}));
        }

        const hierarchyRoot = d3.hierarchy(rootGroup)
           .sum(d => config.sizeField ? Number(d[config.sizeField]) : 1);
            
        const radius = Math.min(width, height) / 2 - 40;
        
        const svgGroup = svg.append("g")
            .attr("transform", `translate(${width/2},${height/2})`);

        if (['tree', 'dendrogram', 'sankey', 'hierarchy'].includes(config.type)) {
             const treeLayout = d3.tree().size([height - 40, width - 100]);
             treeLayout(hierarchyRoot as any);
             svgGroup.attr("transform", `translate(40,20)`);
             
             svgGroup.append("g")
                .attr("fill", "none")
                .attr("stroke", "#cbd5e1")
                .attr("stroke-width", 1.5)
                .selectAll("path")
                .data((hierarchyRoot as any).links())
                .join("path")
                .attr("d", d3.linkHorizontal()
                    .x((d: any) => d.y)
                    .y((d: any) => d.x));
                    
             const node = svgGroup.append("g")
                .selectAll("g")
                .data((hierarchyRoot as any).descendants())
                .join("g")
                .attr("transform", (d: any) => `translate(${d.y},${d.x})`);
                
             const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
             node.append("circle")
                .attr("fill", (d: any) => d.children ? "#94a3b8" : (config.color || colorScale(d.data.name || "")))
                .attr("r", 4)
                .on("mouseover", function(event, d: any) {
                    const text = d.data.name || Object.entries(d.data).filter(([k,v]) => typeof v !== 'object').map(([k,v]) => `<strong>${k}</strong>: ${v}`).join('\n');
                    showTooltip(event, text);
                })
                .on("mouseout", hideTooltip);
                
             node.append("text")
                .attr("dy", "0.31em")
                .attr("x", (d: any) => d.children ? -6 : 6)
                .attr("text-anchor", (d: any) => d.children ? "end" : "start")
                .text((d: any) => String(d.data.name || '').substring(0, 15))
                .style("font-size", "10px")
                .clone(true).lower()
                .attr("stroke", "white").attr("stroke-width", 3);
        } else {
             const treeLayout = d3.tree().size([2 * Math.PI, radius]);
             treeLayout(hierarchyRoot as any);
             
             svgGroup.append("g")
                .attr("fill", "none")
                .attr("stroke", "#cbd5e1")
                .attr("stroke-width", 1.5)
                .selectAll("path")
                .data((hierarchyRoot as any).links())
                .join("path")
                .attr("d", d3.linkRadial()
                    .angle((d: any) => d.x)
                    .radius((d: any) => d.y));
                    
             const node = svgGroup.append("g")
                .selectAll("g")
                .data((hierarchyRoot as any).descendants())
                .join("g")
                .attr("transform", (d: any) => `rotate(${d.x * 180 / Math.PI - 90}) translate(${d.y},0)`);
                
             const colorScale = d3.scaleOrdinal(d3.schemeCategory10);
             node.append("circle")
                .attr("fill", (d: any) => d.children ? "#94a3b8" : (config.color || colorScale(d.data.name || "")))
                .attr("r", 4)
                .on("mouseover", function(event, d: any) {
                    const text = d.data.name || Object.entries(d.data).filter(([k,v]) => typeof v !== 'object').map(([k,v]) => `<strong>${k}</strong>: ${v}`).join('\n');
                    showTooltip(event, text);
                })
                .on("mouseout", hideTooltip);
                
             node.append("text")
                .attr("dy", "0.31em")
                .attr("x", (d: any) => d.x < Math.PI === !d.children ? 6 : -6)
                .attr("text-anchor", (d: any) => d.x < Math.PI === !d.children ? "start" : "end")
                .attr("transform", (d: any) => d.x >= Math.PI ? "rotate(180)" : null)
                .text((d: any) => String(d.data.name || '').substring(0, 15))
                .style("font-size", "10px")
                .clone(true).lower()
                .attr("stroke", "white").attr("stroke-width", 3);
        }
    } else {
        // Fallback or generic scatter using D3
        const margin = {top: 20, right: 20, bottom: 30, left: 40};
        const xField = config.xAxisField || Object.keys(data[0])[0];
        const yField = config.yAxisField || Object.keys(data[0])[1];
        
        const x = d3.scalePoint()
          .domain(data.map(d => d[xField]))
          .range([margin.left, width - margin.right])
          .padding(0.5);
          
        const yValues = data.map(d => Number(d[yField]) || 0);
        const y = d3.scaleLinear()
          .domain([0, d3.max(yValues) || 100]).nice()
          .range([height - margin.bottom, margin.top]);
          
        svg.append("g")
          .attr("transform", `translate(0,${height - margin.bottom})`)
          .call(d3.axisBottom(x).tickSizeOuter(0))
           .attr("color", "#475569")
           .selectAll("text")
           .style("font-size", "10px");
           
        svg.append("g")
          .attr("transform", `translate(${margin.left},0)`)
          .call(d3.axisLeft(y))
           .attr("color", "#475569")
           .selectAll("text")
           .style("font-size", "10px");
           
        svg.append("g")
          .selectAll("circle")
          .data(data)
          .join("circle")
          .attr("cx", d => x(d[xField]) || 0)
          .attr("cy", d => y(Number(d[yField]) || 0))
          .attr("r", 6)
          .attr("fill", config.color || "#ec4899")
          .attr("opacity", 0.7)
          .on("mouseover", function(event, d) {
                d3.select(this).attr("r", 9).attr("opacity", 1);
                const text = `<strong>${xField}</strong>: ${d[xField]}\n<strong>${yField}</strong>: ${d[yField]}`;
                showTooltip(event, text);
          })
          .on("mousemove", function(event) {
                tooltip.style("left", (event.clientX + 10) + "px")
                       .style("top", (event.clientY - 28) + "px");
          })
          .on("mouseout", function() {
                d3.select(this).attr("r", 6).attr("opacity", 0.7);
                hideTooltip();
          });
    }
    
  }, [data, config]);

  return (
     <>
       <div ref={containerRef} className="w-full h-full min-h-[250px]" />
       <div 
         ref={tooltipRef} 
         className="fixed pointer-events-none bg-white px-3 py-2 text-sm text-gray-900 rounded-xl shadow-lg border border-gray-100 opacity-0 transition-opacity z-[9999] font-medium"
         style={{ transitionDuration: '100ms' }}
       />
     </>
  );
}
