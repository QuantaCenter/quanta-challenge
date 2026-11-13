import * as d3 from 'd3';

const MARGIN = { top: 16, right: 16, bottom: 32, left: 40 };
const HEIGHT = 300;

export function createBarChart(container) {
   const width = container.clientWidth || 480;
   const innerWidth = width - MARGIN.left - MARGIN.right;
   const innerHeight = HEIGHT - MARGIN.top - MARGIN.bottom;

   const svg = d3
      .select(container)
      .append('svg')
      .attr('viewBox', [0, 0, width, HEIGHT])
      .attr('width', '100%');

   const root = svg.append('g').attr('transform', 'translate(' + MARGIN.left + ',' + MARGIN.top + ')');
   const xAxis = root.append('g').attr('class', 'axis').attr('transform', 'translate(0,' + innerHeight + ')');
   const yAxis = root.append('g').attr('class', 'axis');
   const bars = root.append('g');

   const x = d3.scaleBand().range([0, innerWidth]).padding(0.25);
   const y = d3.scaleLinear().range([innerHeight, 0]);
   const color = d3.scaleSequential([20, 100], d3.interpolateRgb('#434343', '#FA7C0E'));
   const tooltip = d3.select('#tooltip');

   function update(data) {
      const t = svg.transition().duration(750);
      x.domain(data.map((d) => d.name));
      y.domain([0, 100]);

      xAxis.transition(t).call(d3.axisBottom(x).tickSizeOuter(0));
      yAxis.transition(t).call(d3.axisLeft(y).ticks(5));

      bars
         .selectAll('rect')
         .data(data, (d) => d.name)
         .join(
            (enter) =>
               enter
                  .append('rect')
                  .attr('rx', 6)
                  .attr('x', (d) => x(d.name))
                  .attr('y', innerHeight)
                  .attr('height', 0)
                  .attr('width', x.bandwidth()),
            (update) => update,
            (exit) => exit.remove(),
         )
         .on('mousemove', (event, d) => {
            tooltip
               .style('opacity', 1)
               .style('left', event.pageX + 12 + 'px')
               .style('top', event.pageY - 12 + 'px')
               .text(d.name + '：' + d.value);
         })
         .on('mouseleave', () => tooltip.style('opacity', 0))
         .transition(t)
         .attr('x', (d) => x(d.name))
         .attr('width', x.bandwidth())
         .attr('y', (d) => y(d.value))
         .attr('height', (d) => innerHeight - y(d.value))
         .attr('fill', (d) => color(d.value));
   }

   return { update };
}
