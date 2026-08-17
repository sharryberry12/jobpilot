/**
 * Lowercase names of technologies/tools the tailoring validator treats as
 * "named technologies" even when written in plain lowercase. Heuristics in
 * lib/validate.ts catch acronyms and CamelCase names; this list covers the
 * common all-lowercase spellings (e.g. "react", "docker", "python").
 */
const LIST = `
javascript typescript python java kotlin swift objective-c golang go rust ruby php perl scala clojure elixir erlang haskell
c cpp c++ csharp c# dotnet .net f# fsharp dart lua r matlab julia bash powershell shell sql nosql graphql grpc rest soap
html css sass scss less tailwind tailwindcss bootstrap materialui mui chakra styled-components
react reactjs react.js nextjs next.js remix gatsby vue vuejs vue.js nuxt nuxtjs angular angularjs svelte sveltekit solid solidjs
ember backbone jquery redux zustand mobx recoil rxjs vite webpack rollup parcel esbuild turbopack babel eslint prettier
node nodejs node.js deno bun express fastify koa nestjs nest hapi socket.io django flask fastapi rails ruby-on-rails sinatra
laravel symfony spring springboot spring-boot micronaut quarkus asp.net aspnet blazor phoenix gin echo fiber actix rocket
jest vitest mocha chai jasmine cypress playwright puppeteer selenium testing-library storybook enzyme karma pytest junit
postgresql postgres mysql mariadb sqlite mongodb mongo redis memcached elasticsearch opensearch cassandra dynamodb couchdb
neo4j oracle mssql sqlserver snowflake bigquery redshift databricks clickhouse supabase firebase firestore planetscale prisma
drizzle typeorm sequelize knex mongoose hibernate sqlalchemy
aws azure gcp lambda ec2 s3 rds ecs eks fargate cloudfront route53 iam sqs sns kinesis cloudwatch amplify vercel netlify heroku
digitalocean cloudflare docker kubernetes k8s helm terraform ansible pulumi vagrant nginx apache tomcat jenkins circleci
travis github gitlab bitbucket git svn mercurial argocd flux prometheus grafana datadog newrelic sentry splunk kibana logstash
kafka rabbitmq nats mqtt celery airflow dagster prefect spark hadoop hive flink beam dbt pandas numpy scipy scikit-learn
sklearn tensorflow pytorch keras xgboost lightgbm huggingface transformers langchain llamaindex openai anthropic jupyter
figma sketch adobe photoshop illustrator jira confluence trello asana notion slack teams salesforce hubspot sap workday
oauth oauth2 openid oidc saml jwt ssl tls https http websocket websockets webrtc grpc protobuf json xml yaml toml csv
linux ubuntu debian centos redhat windows macos ios android flutter reactnative react-native expo xamarin ionic cordova
electron tauri unity unreal opengl webgl threejs three.js d3 d3.js recharts chartjs chart.js highcharts plotly tableau powerbi
looker excel vba wordpress drupal shopify magento woocommerce contentful sanity strapi ghost
agile scrum kanban ci/cd cicd devops sre tdd bdd ddd microservices monorepo serverless jamstack pwa seo a11y wcag i18n
`;

export const TECH_DICTIONARY: ReadonlySet<string> = new Set(
  LIST.split(/\s+/).map((s) => s.trim().toLowerCase()).filter(Boolean),
);

/** Common acronyms/words that are not technologies — never flag these. */
export const GENERIC_ACRONYMS: ReadonlySet<string> = new Set([
  "api", "apis", "ui", "ux", "qa", "kpi", "kpis", "okr", "okrs", "roi", "sla", "slas", "pr", "prs", "mvp",
  "b2b", "b2c", "saas", "paas", "iaas", "hr", "it", "id", "ids", "faq", "usa", "uk", "eu", "au", "nz", "us",
  "ceo", "cto", "cfo", "coo", "vp", "svp", "evp", "pm", "am", "eod", "eom", "yoy", "mom", "qoq", "ytd", "fy",
  "crm", "erp", "cms", "seo", "sem", "kpi", "sdk", "sdks", "ide", "cli", "gui", "os", "pc", "tv", "ai", "ml",
  "llm", "llms", "nlp", "cv", "ar", "vr", "iot", "gdpr", "hipaa", "pci", "soc2", "iso", "etl", "elt", "bi", "poc",
  "e2e", "ux/ui", "ui/ux", "r&d", "m&a", "p&l", "ttm", "arr", "mrr", "ltv", "cac", "nps", "csat", "sso",
]);
