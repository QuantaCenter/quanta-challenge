// 判题脚本必须写成 `export default defineTestHandler(...)`：判题机会把 "export default " 替换成 "const run = "；后端给的是 http，不是 page。
export default defineTestHandler(async ({ http, $ }) => {
   $.defineCheckPoint('GET /health 返回 ok', 5, async () => {
      const res = await http.get('/health');
      $.expect(res.status === 200, '期望 /health 返回 200，实际为 ' + res.status);
      $.expect(
         res.json && res.json.ok === true,
         '期望 body.ok 为 true，实际为 ' + JSON.stringify(res.json)
      );
      return 5; // 必须 return 本检查点得分：不返回即使断言全过也记 0 分
   });

   $.defineCheckPoint('POST /items 创建一条待办', 10, async () => {
      // body 传对象时会自动 JSON.stringify 并带上 content-type
      const res = await http.post('/items', { title: '写题' });
      $.expect(res.status === 201, '期望创建返回 201，实际为 ' + res.status);
      const item = res.json && res.json.item;
      $.expect(
         item !== undefined,
         '期望响应体里有 item，实际为 ' + JSON.stringify(res.json)
      );
      $.expect(
         item && item.title === '写题',
         '期望 item.title 为 "写题"，实际为 ' + (item && item.title)
      );
      return 10;
   });

   $.defineCheckPoint('GET /items 能读到刚创建的一条', 5, async () => {
      const res = await http.get('/items');
      $.expect(res.status === 200, '期望 /items 返回 200，实际为 ' + res.status);
      const items = res.json && res.json.items;
      $.expect(
         Array.isArray(items),
         '期望 body.items 是数组，实际为 ' + typeof items
      );
      $.expect(
         Array.isArray(items) && items.length === 1 && items[0].title === '写题',
         '期望只有 1 条 title 为 "写题" 的待办，实际为 ' + JSON.stringify(items)
      );
      return 5;
   });
});
