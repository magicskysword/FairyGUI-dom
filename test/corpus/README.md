# 包兼容语料扫描

先构建运行时，再传入任意 FairyGUI Unity 发布目录：

```powershell
pnpm run build
node test/corpus/scan-package-corpus.cjs `
  --release-dir "D:\path\to\release" `
  --expected-count 30
```

扫描器只依赖调用方传入的目录，不假定 FairyGUI-unity 或其他仓库位于固定路径。
成功时输出结构化 JSON；参数、包数量、解码或装配失败时返回非零退出码和
`CORPUS_SCAN_FAILED`。
