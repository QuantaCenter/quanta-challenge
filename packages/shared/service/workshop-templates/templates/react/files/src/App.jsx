import { useState } from 'react';
import Clock from './components/Clock.jsx';

export default function App() {
   const [count, setCount] = useState(0);

   return (
      <main className="card">
         <span className="badge">React 18</span>
         <h1>你好，React</h1>
         <p>
            编辑 <code>src/App.jsx</code>，保存后组件会快速刷新并保留状态。
         </p>
         <button type="button" onClick={() => setCount((value) => value + 1)}>
            点击次数：{count}
         </button>
         <Clock />
      </main>
   );
}
