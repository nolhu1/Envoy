# Testing

Primary release regression command:

```powershell
node --test tests/regression/*.test.mjs
```

Validation commands used for V1:

```powershell
.\apps\web\node_modules\.bin\eslint.CMD --max-warnings=0
.\apps\web\node_modules\.bin\tsc.CMD --noEmit -p apps\web\tsconfig.json
.\apps\web\node_modules\.bin\next.CMD build apps\web
.\apps\worker\node_modules\.bin\tsc.CMD --noEmit -p apps\worker\tsconfig.json
```


Database smoke test:

```powershell
.\packages\db\node_modules\.bin\prisma.CMD migrate status --schema .\packages\db\prisma\schema.prisma
.\packages\db\node_modules\.bin\tsx.CMD .\packages\db\prisma\seed.ts
```

Run the database smoke only against a disposable local/staging database.
