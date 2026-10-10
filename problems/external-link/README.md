# 站外链接

题目：把「去百度」这个链接补上。**答案模板与参考解只差一行**，那一行就是全部考点。

```html
<!-- 答案模板：没有这一行 -->
<!-- 参考解： -->
<a href="https://www.baidu.com">去百度</a>
```

## 考点

`href="www.baidu.com"` 看着像个网址，但它没有协议，浏览器会当成**相对路径**，
按当前页面拼成 `http://<当前站点>/www.baidu.com` —— 等于在本地找一个叫
`www.baidu.com` 的文件。补上 `https://` 才是外部地址。

## 判分口径

| 检查点 | 分值 | 判什么 |
|---|---|---|
| 页面里只有一个链接，文字是「去百度」 | 10 | 用语义化的 `<a href>`（`onclick` 跳转不算） |
| `href` 写的是带协议的绝对地址 | 10 | 源码里的 `href` 以 `http(s)://` 开头且落在 `www.baidu.com` |
| 解析后的地址是百度首页，而不是本地站点里的同名文件 | 10 | 浏览器解析结果 = `https://www.baidu.com/`，路径必须为空 |
| 点击后离开本地页面 | 10 | 真的跳走了；**判题机没有外网时只提示、不扣分**（环境问题不该算学生头上） |

## 实测判分

在判题机上直接跑过三种页面：

| 页面 | 得分 | 说明 |
|---|---|---|
| 参考解 | **40/40** | 四条全过 |
| 答案模板（没有链接） | 0/40 | 四条都给「页面里没有 `<a href>` 链接」这种可读原因 |
| 学生典型错误 `href="www.baidu.com"` | 10/40 | 抓到的原话：解析后地址是 `http://<站点>/www.baidu.com` |

## 两个实现约束（踩过）

1. **判题脚本跑在 vm2 沙箱里，没有 `URL` 构造函数**：`new URL(...)` 抛
   `URL is not defined`，所以地址用正则/字符串解析。
2. **`page.$eval` 找不到元素时抛的是 Playwright 原始错误**
   （"Failed to find element matching selector"），学生看不懂。
   这里每条检查点先用 `page.$()` 判断存在性，给可读原因。

## 本地流程

```bash
qpc check problems/external-link --strict   # 预检：通过（0 条警告）
qpc upload problems/external-link           # 新建题目
qpc publish <pid>
```

`buildCommand` 已按 RUN002 写成 `echo built`：没有构建步骤也必须给，
否则在线编辑器里点「提交」不会有任何反应。

更完整的踩坑清单见仓库 `docs/PROBLEM_AUTHORING.md`。
