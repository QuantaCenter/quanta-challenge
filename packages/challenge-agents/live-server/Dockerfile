FROM node:slim

WORKDIR /app

# install dependencies
#
# 必须锁版本：写成 `npm install -g live-server` 时每次重建镜像都会解析 latest，
# 判题容器里的静态服务器会随上游发版无声变化（该包自 2022 年 1.2.2 后未再发版，
# 所以锁定等于保持现状，但能防住将来）。
# 注意：live-server@1.2.2 自身的依赖里有若干 `latest`（opn / cors / send /
# object-assign / proxy-middleware），所以锁顶层版本只是收窄、不能完全冻结；
# 要彻底冻结需在镜像里改用带 lockfile 的 `npm ci`（会引入额外文件与 CI 变更）。
RUN npm install -g live-server@1.2.2

# 注意：调度器把用户代码快照挂载到 /app，而快照内部保留了一层 project/ 目录
# （真实页面位于 /app/project/index.html）。若以 /app 作为站点根目录，live-server
# 找不到 index.html 会返回 404，判题脚本的 waitForSelector 将一直等待，
# 最终表现为 "Judge Machine response timeout"（前端只显示空白判题详情）。
# 因此必须显式把 project 子目录作为站点根目录。
CMD ["live-server", "project", "--port=3000", "--host=0.0.0.0", "--no-browser"]

# expose the port
EXPOSE 3000