# 提交与复现说明

## 项目运行

本项目为 Node.js 服务端应用，不能仅发布为 GitHub Pages 等静态站点。准备 Node.js 22.16 或以上版本与 npm，执行 `npm ci`，复制 `.env.example` 为 `.env.local`，配置服务端 `AI_API_KEY` 后运行启动脚本。Windows 使用 `start.bat`，Linux 或 macOS 使用 `sh ./start.sh`。未配置模型也能浏览内容，但不能生成行程。

默认服务端口3000，可用 `JINLING_PORT` 修改。命令行直接启动生产构建：

```bash
npm run build
node node_modules/next/dist/bin/next start --hostname 0.0.0.0 --port 3000
```

当前使用 deepseek-flash。模型账号和余额由运行方准备，不在仓库提供公用密钥。生成请求会传送用户输入及相关目的地资料，不应填写敏感信息。

## 仓库内容与历史

源码、测试、依赖清单与锁文件、环境变量模板、运行脚本和项目文档均在仓库中。密钥、依赖安装目录、构建缓存和运行任务不提交。图片适用各自许可，来源见素材说明与逐图台账。

Git 保留真实开发提交。公开整理前的早期代码历史经过隐私过滤后合并回主线，保留原提交时间、主题和父子关系；私人说明、作者联系方式及不再公开的历史素材不恢复。历史恢复合并只连接代码沿革，当前版本的文件内容不被旧版本覆盖。没有补造课程作业阶段不存在的 Git 提交。

## 评审检查入口

1. 阅读 README 中的团队、项目来源、技术栈与环境配置。
2. 运行 `npm test`、`npm run typecheck` 和 `npm run build`。
3. 按 `docs/acceptance.md` 验证探索、图库、需求覆盖、日期冲突、修改与刷新恢复。
4. 若评估真实模型，显式运行 `node scripts/evaluate-plans.mjs --live`；普通单元测试不调用模型。
5. 结合 `docs/architecture.md` 和 `docs/planner-quality.md` 查看 AI 数据流、业务规则及测试边界。

完整项目的技术文档与演示视频按报名系统要求单独提交；在线视频演示属于可选项，不能用临时截图或模拟生成冒充实时在线服务。
