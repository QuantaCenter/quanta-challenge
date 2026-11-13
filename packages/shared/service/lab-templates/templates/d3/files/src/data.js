export const LANGUAGES = [
   { name: 'JavaScript', value: 92 },
   { name: 'Python', value: 88 },
   { name: 'TypeScript', value: 76 },
   { name: 'Java', value: 64 },
   { name: 'Go', value: 52 },
   { name: 'Rust', value: 41 },
   { name: 'C++', value: 58 },
   { name: 'Kotlin', value: 33 },
];

export const shuffleValues = (items) =>
   items.map((item) => ({ ...item, value: Math.round(20 + Math.random() * 80) }));

export const GRAPH = {
   nodes: [
      { id: 'Web', group: 0 },
      { id: 'HTML', group: 1 },
      { id: 'CSS', group: 1 },
      { id: 'JavaScript', group: 1 },
      { id: 'Vue', group: 2 },
      { id: 'React', group: 2 },
      { id: 'Vite', group: 3 },
      { id: 'Node.js', group: 3 },
      { id: 'TypeScript', group: 2 },
      { id: 'D3', group: 2 },
   ],
   links: [
      { source: 'Web', target: 'HTML' },
      { source: 'Web', target: 'CSS' },
      { source: 'Web', target: 'JavaScript' },
      { source: 'JavaScript', target: 'Vue' },
      { source: 'JavaScript', target: 'React' },
      { source: 'JavaScript', target: 'TypeScript' },
      { source: 'JavaScript', target: 'D3' },
      { source: 'JavaScript', target: 'Node.js' },
      { source: 'Node.js', target: 'Vite' },
      { source: 'Vite', target: 'Vue' },
      { source: 'Vite', target: 'React' },
   ],
};
