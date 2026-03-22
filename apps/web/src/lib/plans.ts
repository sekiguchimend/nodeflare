// Shared plan definitions - must match backend crates/billing/src/plans.rs

export interface PlanLimits {
  max_servers: number;
  max_deployments_per_month: number;
  max_requests_per_month: number;
  max_team_members: number;
  log_retention_days: number;
  custom_domains: boolean;
  priority_support: boolean;
  sso_enabled: boolean;
}

export interface PlanDefinition {
  plan: 'free' | 'pro' | 'team' | 'enterprise';
  name: string;
  description: string;
  price_monthly_jpy: number;
  price_yearly_jpy: number;
  limits: PlanLimits;
  features: string[];
}

// 1 USD = 150 JPY (approximate, rounded for clean pricing)
// Backend: Free $0, Pro $29, Team $99, Enterprise $499
export const PLANS: PlanDefinition[] = [
  {
    plan: 'free',
    name: 'Free',
    description: '個人開発や検証に最適',
    price_monthly_jpy: 0,
    price_yearly_jpy: 0,
    limits: {
      max_servers: 3,
      max_deployments_per_month: 50,
      max_requests_per_month: 10_000,
      max_team_members: 1,
      log_retention_days: 7,
      custom_domains: false,
      priority_support: false,
      sso_enabled: false,
    },
    features: [
      'サーバー3つまで',
      'デプロイ50回/月',
      '月間10,000リクエスト',
      'ログ7日間保持',
      'コミュニティサポート',
    ],
  },
  {
    plan: 'pro',
    name: 'Pro',
    description: '本番運用に必要な全機能',
    price_monthly_jpy: 2980,
    price_yearly_jpy: 29800, // ~17% off
    limits: {
      max_servers: 20,
      max_deployments_per_month: 500,
      max_requests_per_month: 500_000,
      max_team_members: 1,
      log_retention_days: 30,
      custom_domains: true,
      priority_support: false,
      sso_enabled: false,
    },
    features: [
      'サーバー20個まで',
      'デプロイ500回/月',
      '月間500,000リクエスト',
      'ログ30日間保持',
      'カスタムドメイン',
      'メールサポート',
    ],
  },
  {
    plan: 'team',
    name: 'Team',
    description: 'チームでの本格運用に',
    price_monthly_jpy: 9800,
    price_yearly_jpy: 98000, // ~17% off
    limits: {
      max_servers: 100,
      max_deployments_per_month: 2000,
      max_requests_per_month: 5_000_000,
      max_team_members: 10,
      log_retention_days: 90,
      custom_domains: true,
      priority_support: true,
      sso_enabled: false,
    },
    features: [
      'サーバー100個まで',
      'デプロイ2000回/月',
      '月間5,000,000リクエスト',
      'ログ90日間保持',
      'カスタムドメイン',
      'チームメンバー10人まで',
      '優先サポート',
    ],
  },
  {
    plan: 'enterprise',
    name: 'Enterprise',
    description: '大規模組織向け',
    price_monthly_jpy: 49800,
    price_yearly_jpy: 498000, // ~17% off
    limits: {
      max_servers: Infinity,
      max_deployments_per_month: Infinity,
      max_requests_per_month: Infinity,
      max_team_members: Infinity,
      log_retention_days: 365,
      custom_domains: true,
      priority_support: true,
      sso_enabled: true,
    },
    features: [
      'サーバー無制限',
      'デプロイ無制限',
      'リクエスト無制限',
      'ログ1年間保持',
      'カスタムドメイン',
      'チームメンバー無制限',
      'SSO/SAML',
      '専任サポート',
      'SLA保証',
    ],
  },
];

export function getPlan(planId: string): PlanDefinition | undefined {
  return PLANS.find(p => p.plan === planId);
}

export function formatPrice(price: number): string {
  return `¥${price.toLocaleString()}`;
}
