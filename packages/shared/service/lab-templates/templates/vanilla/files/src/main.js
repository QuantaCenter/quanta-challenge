import './style.css';
import { setupCounter } from './counter.js';

document.querySelector('#app').innerHTML = `
   <main class="card">
      <span class="badge">Vite + JavaScript</span>
      <h1>开始你的创作</h1>
      <p>编辑 <code>src/main.js</code>，保存后页面会自动热更新。</p>
      <button id="counter" type="button"></button>
   </main>
`;

setupCounter(document.querySelector('#counter'));
