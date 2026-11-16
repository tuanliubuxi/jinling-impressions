# 开发与测试

## 基础检查

```bash
npm test
npm run typecheck
npm run build
```

单元测试覆盖请求契约、检索与否定表达、路线约束、幂等任务、持久化、缓存恢复和来源校验。测试模型调用使用模拟响应。

## HTTP smoke

先启动已构建应用：

```bash
npm start -- --hostname 127.0.0.1 --port 3101
```

另开终端运行 `npm run test:smoke`。默认检查页面、详情、404、输入错误与任务契约，不发起真实模型生成。可用 `SMOKE_BASE_URL` 指定地址。

## 移动端交互回归

脚本使用 Playwright 和已安装的 Microsoft Edge。验证提交不导航、脚本不可用时阻止生成、重复请求、刷新恢复、暂停继续、版本修改、用量报告及存储受限。

在独立终端禁用模型接入并启动测试服务，以下为 PowerShell 示例：

```powershell
$env:AI_BASE_URL='https://no-model.invalid'
npm.cmd start -- --hostname 0.0.0.0 --port 3103
```

另开终端执行 `npm run test:mobile`。脚本确认服务模型配置不可用后才继续，并拦截浏览器生成请求。测试结束后关闭该测试终端，避免影响正常服务。

## 真实模型评估

图库与筛选可在本地验证服务上运行 `npm run test:explore`，默认地址 `http://127.0.0.1:3110`，可用 `SMOKE_BASE_URL` 覆盖。检查桌面与手机筛选、别名搜索、轮播、放大、键盘关闭和全部详情／图片，拦截模型入口，不产生模型调用。

```bash
npm run test:eval
# 显式开启计费请求
npm run test:eval -- --live
```

默认只列出评估场景。`--live` 覆盖常见出游、亲子、老人、雨天、夜景、美食、预算、两日游、购物、排除要求、修改与资料不足等情况。

`EVAL_CASES` 可用逗号指定案例 ID；`EVAL_API_BASE_URL` 指定应用地址后，评估会经过完整任务接口，并核对同编号重复提交是否复用结果和用量。

评估输出保存在被 Git 忽略的 `.local/evaluations`。只有显式设置 `EVAL_CAPTURE_OUTPUTS=1` 才会保存失败模型原文，常规运行不启用此诊断开关。报告可能包含输入和生成内容，不作为公开素材提交。

## 更新项目预览

启动本地应用后执行 `npm run preview:capture`。默认地址为 `http://127.0.0.1:3110`，可用 `PREVIEW_BASE_URL` 覆盖。脚本使用全新浏览器上下文截取公开页面并阻止规划 API 请求，不调用模型。
