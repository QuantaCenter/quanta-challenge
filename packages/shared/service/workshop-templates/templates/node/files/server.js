import express from 'express';

const app = express();
const PORT = 3000;

app.use(express.json());
app.use(express.static('public'));

let nextId = 3;
let todos = [
   { id: 1, text: '在工坊里启动一个 Express 服务', done: true },
   { id: 2, text: '给接口加一个 PATCH 方法', done: false },
];

app.get('/api/todos', (req, res) => {
   res.json(todos);
});

app.post('/api/todos', (req, res) => {
   const text = String(req.body?.text ?? '').trim();
   if (!text) {
      return res.status(400).json({ message: 'text 不能为空' });
   }
   const todo = { id: nextId++, text, done: false };
   todos.push(todo);
   res.status(201).json(todo);
});

app.delete('/api/todos/:id', (req, res) => {
   const id = Number(req.params.id);
   todos = todos.filter((todo) => todo.id !== id);
   res.status(204).end();
});

app.listen(PORT, () => {
   console.log('Server is running at http://localhost:' + PORT);
});
