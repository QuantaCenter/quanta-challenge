import * as d3 from 'd3';

const HEIGHT = 300;
const COLORS = ['#FA7C0E', '#A6FB1D', '#61DAFB', '#C084FC'];

export function createForceGraph(container, graph) {
   const width = container.clientWidth || 480;
   const nodes = graph.nodes.map((d) => ({ ...d }));
   const links = graph.links.map((d) => ({ ...d }));

   const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', [0, 0, width, HEIGHT])
      .attr('width', '100%');

   const simulation = d3
      .forceSimulation(nodes)
      .force('link', d3.forceLink(links).id((d) => d.id).distance(70))
      .force('charge', d3.forceManyBody().strength(-260))
      .force('center', d3.forceCenter(width / 2, HEIGHT / 2))
      .force('collide', d3.forceCollide(28));

   const link = svg
      .append('g')
      .attr('stroke', '#434343')
      .selectAll('line')
      .data(links)
      .join('line')
      .attr('stroke-width', 1.5);

   const node = svg
      .append('g')
      .selectAll('g')
      .data(nodes)
      .join('g')
      .attr('class', 'node')
      .call(
         d3
            .drag()
            .on('start', (event, d) => {
               if (!event.active) simulation.alphaTarget(0.3).restart();
               d.fx = d.x;
               d.fy = d.y;
            })
            .on('drag', (event, d) => {
               d.fx = event.x;
               d.fy = event.y;
            })
            .on('end', (event, d) => {
               if (!event.active) simulation.alphaTarget(0);
               d.fx = null;
               d.fy = null;
            }),
      );

   node
      .append('circle')
      .attr('r', (d) => (d.group === 0 ? 14 : 9))
      .attr('fill', (d) => COLORS[d.group % COLORS.length]);

   node
      .append('text')
      .text((d) => d.id)
      .attr('x', 14)
      .attr('y', 4);

   simulation.on('tick', () => {
      link
         .attr('x1', (d) => d.source.x)
         .attr('y1', (d) => d.source.y)
         .attr('x2', (d) => d.target.x)
         .attr('y2', (d) => d.target.y);
      node.attr('transform', (d) => 'translate(' + d.x + ',' + d.y + ')');
   });
}
