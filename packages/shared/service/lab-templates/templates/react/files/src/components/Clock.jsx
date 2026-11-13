import { useEffect, useState } from 'react';

export default function Clock() {
   const [now, setNow] = useState(() => new Date());

   useEffect(() => {
      const timer = setInterval(() => setNow(new Date()), 1000);
      return () => clearInterval(timer);
   }, []);

   return (
      <section className="clock">
         <small>当前时间</small>
         <strong>{now.toLocaleTimeString('zh-CN', { hour12: false })}</strong>
      </section>
   );
}
