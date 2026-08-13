Personal academic blog of [ZHANG Baizhou](https://zhangbz764.github.io/).

Made with Jekyll using the [Tale](https://github.com/chesterhow/tale/) theme.

## CV authoring

Edit `_data/cv.yml`, then run `npm run cv:preview` for a local English/Chinese preview. Add `-- --no-open` when you only need the local URL. Run `npm run cv:check` to validate selection and required fields. `npm run cv:build` creates the complete Jekyll site and all CV downloads locally once Ruby and Chromium dependencies are installed.

Collection IDs are filename stems. Select no more than five publications, use only `full` or `compact` for `detail`, and provide an issuer for every award. Keep phone numbers out of the public source; add one to the downloaded DOCX when needed.

编辑 `_data/cv.yml` 后，运行 `npm run cv:preview` 可本地预览英文和中文简历；只需要本地地址时可加 `-- --no-open`。运行 `npm run cv:check` 检查选择和必填字段。安装 Ruby 与 Chromium 依赖后，`npm run cv:build` 会在本地生成完整 Jekyll 网站和全部 CV 下载文件。

集合 ID 使用文件名主干。代表性论文最多选择五项，`detail` 只能填写 `full` 或 `compact`，每项奖励都必须填写颁发机构。请勿将电话号码提交到公开源码；需要时可在下载的 DOCX 中补充。

## GitHub Pages deployment

One-time setup: open the repository's **Settings**, choose **Pages** under **Code and automation**, and set **Source** to **GitHub Actions**. Push the workflow commit, then open its run on the **Actions** tab and follow the `github-pages` environment URL after deployment.

Pull requests run the complete validation and production build but do not deploy. A failed build does not replace the site, so the last successful deployment remains available. For routine deployment changes, edit `.github/workflows/pages.yml` in a normal pull request. When a run fails, open the failed job in **Actions**, expand the first failed step, and use its log to reproduce the same command locally.

## GitHub Pages 部署

首次设置时，打开仓库的 **Settings**，在 **Code and automation** 下选择 **Pages**，并将 **Source** 设为 **GitHub Actions**。推送工作流提交后，在 **Actions** 标签页打开对应运行；部署完成后，可通过 `github-pages` 环境链接访问网站。

拉取请求会执行完整检查和生产构建，但不会发布。构建失败不会替换线上网站，因此上一次成功部署仍可访问。日常调整部署流程时，请在普通拉取请求中编辑 `.github/workflows/pages.yml`。如运行失败，请在 **Actions** 中打开失败任务，展开第一个失败步骤，并根据日志在本地复现同一命令。
