# Canonical folder tree

```
SIGE_panel_administracion_SaaS/
├── .cursor/skills/sige-superadmin-panel/   # Project skills
├── docs/
│   ├── panel-api.openapi.yaml              # Panel internal API
│   ├── control-api.openapi.yaml            # Monolith Control API reference
│   └── tenant-lifecycle.md                 # Operator onboarding flow
├── server/
│   ├── httpServer.js                       # Production entry (static + API)
│   ├── apiRouter.js                        # Route dispatch
│   ├── requestAdapter.js                   # Shared req/res adapter
│   └── routes/
│       ├── auth/                           # Superadmin login
│       ├── tenants/                        # Registry CRUD + proxy ops
│       └── health/
├── api/_lib/                               # Domain layer
├── src/
│   ├── pages/superadmin/                   # Dashboard, list, detail
│   ├── components/                         # Shared UI
│   └── lib/api.js                          # Frontend fetch helpers
├── scripts/db/migrations/                  # Panel registry SQL
├── tests/                                  # unit / integration
├── Dockerfile
├── docker-compose.yml
└── .env.example
```
