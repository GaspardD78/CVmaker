/**
 * Synonym groups for CV/job-offer keyword matching.
 * Each array is a group of equivalent terms; the first element is the canonical form.
 * All entries must be lowercase.
 *
 * Used by the compatibility scorer to match "k8s" ↔ "kubernetes", "js" ↔ "javascript", etc.
 */
export const SYNONYM_GROUPS: readonly string[][] = [
  // JavaScript ecosystem
  ['javascript', 'js', 'ecmascript', 'es6', 'es2015', 'es2016', 'es2017', 'es2018', 'es2019', 'es2020', 'es2021'],
  ['typescript', 'ts'],
  ['react', 'reactjs', 'react.js', 'react native'],
  ['vue', 'vuejs', 'vue.js', 'vue3', 'vue2'],
  ['angular', 'angularjs', 'angular.js'],
  ['node', 'nodejs', 'node.js'],
  ['nextjs', 'next.js', 'next js'],
  ['nuxtjs', 'nuxt.js', 'nuxt'],
  ['svelte', 'sveltekit'],
  ['redux', 'zustand', 'mobx', 'state management'],
  ['webpack', 'vite', 'rollup', 'bundler'],

  // Python ecosystem
  ['python', 'py'],
  ['django', 'flask', 'fastapi', 'tornado'],
  ['pandas', 'dataframe'],
  ['numpy', 'scipy'],
  ['pytorch', 'torch'],
  ['tensorflow', 'tf', 'keras'],
  ['scikit-learn', 'sklearn', 'scikit learn'],
  ['jupyter', 'notebook', 'jupyter notebook'],

  // JVM
  ['java'],
  ['kotlin'],
  ['spring', 'spring boot', 'spring framework', 'springboot'],
  ['scala'],
  ['gradle', 'maven'],

  // .NET
  ['c#', 'csharp', 'c sharp'],
  ['dotnet', '.net', 'asp.net', 'aspnet'],

  // PHP
  ['php'],
  ['symfony'],
  ['laravel'],

  // Ruby
  ['ruby', 'rails', 'ruby on rails', 'ror'],

  // Go
  ['go', 'golang'],

  // Rust
  ['rust'],

  // Mobile
  ['swift', 'swiftui', 'xcode', 'ios development'],
  ['objective-c', 'objc'],
  ['android', 'android development'],
  ['flutter', 'dart'],
  ['react native', 'expo'],
  ['mobile development', 'développement mobile'],

  // Databases
  ['postgresql', 'postgres', 'psql'],
  ['mysql', 'mariadb'],
  ['mongodb', 'mongo', 'mongoose'],
  ['redis', 'cache', 'caching'],
  ['elasticsearch', 'opensearch', 'elastic'],
  ['sqlite'],
  ['oracle', 'oracle database'],
  ['sql server', 'mssql', 'microsoft sql server'],
  ['cassandra', 'apache cassandra'],
  ['dynamodb', 'amazon dynamodb'],
  ['firebase', 'firestore', 'realtime database'],
  ['supabase'],

  // Cloud
  ['aws', 'amazon web services', 'amazon aws', 'amazon cloud'],
  ['gcp', 'google cloud', 'google cloud platform'],
  ['azure', 'microsoft azure', 'azure cloud'],
  ['heroku'],
  ['vercel'],
  ['netlify'],
  ['cloudflare'],
  ['digitalocean'],

  // DevOps / Infrastructure
  ['docker', 'containerization', 'containers', 'container'],
  ['kubernetes', 'k8s', 'k8', 'helm'],
  ['terraform', 'infrastructure as code', 'iac'],
  ['ansible', 'puppet', 'chef', 'salt'],
  ['ci/cd', 'cicd', 'continuous integration', 'continuous delivery', 'continuous deployment', 'intégration continue', 'déploiement continu'],
  ['devops', 'dev ops', 'devsecops'],
  ['sre', 'site reliability', 'site reliability engineering'],
  ['linux', 'unix', 'bash', 'shell', 'shell scripting'],
  ['nginx', 'apache', 'web server', 'serveur web'],
  ['jenkins', 'github actions', 'gitlab ci', 'circleci', 'travis', 'bitbucket pipelines'],
  ['prometheus', 'grafana', 'monitoring', 'observability'],
  ['datadog', 'newrelic', 'sentry'],
  ['elk', 'kibana', 'logstash', 'log management'],
  ['serverless', 'lambda', 'faas', 'cloud functions'],
  ['microservices', 'micro-services', 'microservice', 'architecture microservices'],
  ['api', 'rest', 'restful', 'rest api', 'api rest'],
  ['graphql', 'graph ql', 'apollo'],
  ['grpc', 'protobuf', 'protocol buffers'],
  ['kafka', 'message queue', 'rabbitmq', 'activemq', 'event streaming', 'event driven'],
  ['git', 'version control', 'gestion de version', 'scm'],
  ['github', 'gitlab', 'bitbucket'],

  // Security
  ['cybersecurity', 'cyber security', 'sécurité informatique', 'information security', 'infosec'],
  ['pentest', 'penetration testing', 'ethical hacking', 'test d\'intrusion'],
  ['oauth', 'oauth2', 'openid', 'saml', 'sso', 'single sign-on'],
  ['jwt', 'json web token'],
  ['authentication', 'authorization', 'authentification', 'autorisation', 'iam'],

  // Data / ML / AI
  ['machine learning', 'ml', 'apprentissage automatique', 'apprentissage machine'],
  ['deep learning', 'dl', 'apprentissage profond'],
  ['artificial intelligence', 'ai', 'intelligence artificielle', 'ia'],
  ['nlp', 'natural language processing', 'traitement du langage naturel', 'traitement automatique du langage'],
  ['computer vision', 'vision par ordinateur', 'image recognition', 'reconnaissance d\'image'],
  ['data science', 'data scientist'],
  ['data engineering', 'data engineer', 'ingénieur données'],
  ['data analyst', 'analyste données', 'business intelligence', 'bi'],
  ['mlops', 'ml ops'],
  ['llm', 'large language model', 'gpt', 'chatgpt', 'claude'],
  ['power bi', 'tableau', 'looker', 'qlik', 'data visualization', 'visualisation de données'],
  ['spark', 'apache spark', 'pyspark'],
  ['hadoop', 'mapreduce', 'hdfs', 'hive'],
  ['airflow', 'apache airflow', 'data pipeline', 'etl', 'elt'],
  ['dbt', 'data build tool'],
  ['snowflake', 'bigquery', 'redshift', 'data warehouse', 'entrepôt de données'],

  // Web / Frontend
  ['html', 'html5'],
  ['css', 'css3', 'stylesheet'],
  ['scss', 'sass', 'less'],
  ['tailwind', 'tailwind css'],
  ['bootstrap'],
  ['figma', 'sketch', 'adobe xd', 'ui design', 'ux design', 'ui/ux'],
  ['responsive design', 'responsive', 'mobile first'],
  ['seo', 'search engine optimization', 'référencement naturel'],
  ['web accessibility', 'wcag', 'accessibilité web', 'a11y'],
  ['pwa', 'progressive web app'],

  // Testing
  ['testing', 'test', 'qa', 'quality assurance', 'assurance qualité'],
  ['tdd', 'test driven development', 'test driven', 'développement piloté par les tests'],
  ['bdd', 'behavior driven development'],
  ['unit testing', 'tests unitaires'],
  ['integration testing', 'tests d\'intégration'],
  ['e2e', 'end to end', 'end-to-end', 'tests bout en bout'],
  ['jest', 'vitest', 'mocha', 'jasmine'],
  ['cypress', 'playwright', 'selenium'],
  ['pytest', 'unittest'],

  // Blockchain / Web3
  ['blockchain'],
  ['web3'],
  ['solidity', 'smart contracts', 'smart contract'],
  ['ethereum', 'defi'],

  // Productivity / Tools
  ['jira', 'linear', 'asana', 'trello', 'project management'],
  ['confluence', 'notion', 'documentation'],
  ['slack', 'teams', 'discord'],
  ['figma', 'canva'],

  // Methodologies
  ['agile', 'méthodologie agile'],
  ['scrum', 'sprint', 'kanban', 'lean', 'safe'],
  ['devops', 'dev ops'],
  ['pair programming', 'mob programming', 'code review', 'revue de code'],
  ['clean code', 'solid', 'design patterns', 'patterns de conception'],
  ['ddd', 'domain driven design', 'domain-driven design'],
  ['tdd', 'test driven development'],

  // Soft skills / Management (FR/EN)
  ['management', 'gestion d\'équipe', 'team management', 'encadrement'],
  ['leadership', 'direction'],
  ['communication', 'présentation', 'presentation'],
  ['travail en équipe', 'teamwork', 'collaboration'],
  ['résolution de problèmes', 'problem solving', 'problem-solving'],
  ['gestion de projet', 'project management'],
  ['mentorat', 'mentoring', 'coaching'],
  ['autonomie', 'autonomy', 'initiative'],

  // Languages (spoken)
  ['anglais', 'english'],
  ['français', 'french'],
  ['espagnol', 'spanish', 'español'],
  ['allemand', 'german', 'deutsch'],
  ['mandarin', 'chinese', 'chinois'],

  // Microsoft / Enterprise
  ['power automate', 'power apps', 'power platform', 'microsoft power platform'],
  ['salesforce', 'crm', 'hubspot'],
  ['sharepoint', 'microsoft 365', 'office 365'],
  ['excel', 'vba', 'spreadsheet'],
  ['sap', 'erp'],
];

/**
 * Flat map: every term → its canonical (first element of its group).
 * Built once at module load.
 */
export const SYNONYM_MAP = new Map<string, string>();

for (const group of SYNONYM_GROUPS) {
  const canonical = group[0];
  for (const term of group) {
    SYNONYM_MAP.set(term, canonical);
  }
}

/**
 * Returns the canonical form of a term (lowercase).
 * Falls back to the input itself if no synonym is known.
 */
export function getCanonical(term: string): string {
  return SYNONYM_MAP.get(term.toLowerCase()) ?? term.toLowerCase();
}

/**
 * Returns all known variants for a canonical term (including itself).
 */
export function getAllVariants(canonical: string): string[] {
  for (const group of SYNONYM_GROUPS) {
    if (group.includes(canonical)) return group;
  }
  return [canonical];
}
