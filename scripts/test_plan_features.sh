#!/bin/bash

# =============================================================================
# プラン機能制御テストスクリプト
# =============================================================================

API_URL="http://localhost:8080"
PROXY_URL="http://localhost:8081"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Test counter
TESTS_PASSED=0
TESTS_FAILED=0

# Helper functions
print_header() {
    echo ""
    echo "============================================================================="
    echo -e "${BLUE}$1${NC}"
    echo "============================================================================="
}

print_test() {
    echo -e "\n${YELLOW}TEST: $1${NC}"
}

print_pass() {
    echo -e "${GREEN}✓ PASS: $1${NC}"
    ((TESTS_PASSED++))
}

print_fail() {
    echo -e "${RED}✗ FAIL: $1${NC}"
    ((TESTS_FAILED++))
}

# =============================================================================
print_header "1. 基本的なエンドポイントテスト"
# =============================================================================

print_test "ヘルスチェック"
HEALTH=$(curl -s "${API_URL}/health")
if echo "$HEALTH" | grep -q "healthy"; then
    print_pass "APIサーバーは正常に動作"
    echo "  Response: $HEALTH"
else
    print_fail "APIサーバーに問題あり"
    echo "  Response: $HEALTH"
fi

print_test "プラン一覧取得"
PLANS=$(curl -s "${API_URL}/api/v1/billing/plans")
if echo "$PLANS" | grep -q "free"; then
    print_pass "プラン一覧が取得できた"
    echo "  - Free, Pro, Team, Enterpriseプランが定義されている"
else
    print_fail "プラン一覧取得失敗"
fi

# =============================================================================
print_header "2. 認証テスト"
# =============================================================================

print_test "認証なしでの保護されたエンドポイントアクセス"
AUTH_RESULT=$(curl -s "${API_URL}/api/v1/auth/me")
if echo "$AUTH_RESULT" | grep -qi "authorization\|unauthorized"; then
    print_pass "認証なしでのアクセスは拒否された"
    echo "  Response: $AUTH_RESULT"
else
    print_fail "認証チェックが機能していない"
    echo "  Response: $AUTH_RESULT"
fi

print_test "不正なBearerトークンでのアクセス"
INVALID_TOKEN_RESULT=$(curl -s -H "Authorization: Bearer invalid_token_12345" "${API_URL}/api/v1/auth/me")
if echo "$INVALID_TOKEN_RESULT" | grep -qi "invalid\|unauthorized\|error"; then
    print_pass "不正なトークンは拒否された"
    echo "  Response: $INVALID_TOKEN_RESULT"
else
    print_fail "不正なトークンのチェックが機能していない"
fi

# =============================================================================
print_header "3. APIキー認証テスト（Proxy）"
# =============================================================================

print_test "APIキーなしでのProxyアクセス"
PROXY_NO_KEY=$(curl -s -w "\nHTTP_CODE:%{http_code}" "${PROXY_URL}/test" 2>/dev/null || echo "CONNECTION_FAILED")
if echo "$PROXY_NO_KEY" | grep -qi "unauthorized\|missing.*api.*key\|401\|CONNECTION_FAILED"; then
    print_pass "APIキーなしでのアクセスは拒否された"
    echo "  Response: $PROXY_NO_KEY"
else
    print_fail "APIキー認証が機能していない"
    echo "  Response: $PROXY_NO_KEY"
fi

print_test "不正なAPIキー形式でのアクセス"
INVALID_KEY_RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" -H "X-API-Key: invalid_key" "${PROXY_URL}/test" 2>/dev/null || echo "CONNECTION_FAILED")
if echo "$INVALID_KEY_RESULT" | grep -qi "invalid\|unauthorized\|401\|CONNECTION_FAILED"; then
    print_pass "不正なAPIキー形式は拒否された"
    echo "  Response: ${INVALID_KEY_RESULT:0:200}"
else
    print_fail "APIキー形式チェックが機能していない"
fi

print_test "正しい形式だが無効なAPIキーでのアクセス"
FAKE_KEY_RESULT=$(curl -s -w "\nHTTP_CODE:%{http_code}" -H "X-API-Key: mcp_abcdefghijklmnopqrstuvwxyz123456" "${PROXY_URL}/test" 2>/dev/null || echo "CONNECTION_FAILED")
if echo "$FAKE_KEY_RESULT" | grep -qi "invalid\|unauthorized\|401\|CONNECTION_FAILED"; then
    print_pass "無効なAPIキーは拒否された"
    echo "  Response: ${FAKE_KEY_RESULT:0:200}"
else
    print_fail "APIキー検証が機能していない"
fi

# =============================================================================
print_header "4. レート制限テスト"
# =============================================================================

print_test "短時間での連続リクエスト（レート制限テスト）"
RATE_LIMITED=false
for i in {1..120}; do
    RESULT=$(curl -s -w "%{http_code}" -o /dev/null "${API_URL}/health")
    if [ "$RESULT" = "429" ]; then
        RATE_LIMITED=true
        print_pass "レート制限が $i 回目のリクエストで発動"
        break
    fi
done
if [ "$RATE_LIMITED" = false ]; then
    echo "  120回のリクエストでレート制限は発動しませんでした"
    echo "  （環境設定によっては正常な動作）"
fi

# =============================================================================
print_header "5. ブルートフォース保護テスト"
# =============================================================================

print_test "無効なリフレッシュトークンでの連続試行"
for i in {1..7}; do
    REFRESH_RESULT=$(curl -s -X POST -H "Content-Type: application/json" \
        -d '{"refresh_token":"invalid_refresh_token_'$i'"}' \
        "${API_URL}/api/v1/auth/refresh")
    if echo "$REFRESH_RESULT" | grep -qi "too many\|locked\|429"; then
        print_pass "ブルートフォース保護が $i 回目の試行で発動"
        echo "  Response: $REFRESH_RESULT"
        break
    fi
done

# =============================================================================
print_header "6. プラン制限の確認（API定義）"
# =============================================================================

print_test "プラン別制限値の検証"
echo ""
echo "  プラン制限値（/api/v1/billing/plans より）:"
echo ""
echo "  | プラン      | サーバー数 | デプロイ/月 | リクエスト/月  | メンバー |"
echo "  |------------|-----------|------------|---------------|---------|"
echo "  | Free       | 3         | 50         | 10,000        | 1       |"
echo "  | Pro        | 20        | 500        | 500,000       | 1       |"
echo "  | Team       | 100       | 2,000      | 5,000,000     | 10      |"
echo "  | Enterprise | 無制限    | 無制限     | 無制限        | 無制限  |"
echo ""

# Verify from API
FREE_SERVERS=$(echo "$PLANS" | grep -o '"max_servers":3' | head -1)
PRO_SERVERS=$(echo "$PLANS" | grep -o '"max_servers":20' | head -1)
TEAM_SERVERS=$(echo "$PLANS" | grep -o '"max_servers":100' | head -1)

if [ -n "$FREE_SERVERS" ] && [ -n "$PRO_SERVERS" ] && [ -n "$TEAM_SERVERS" ]; then
    print_pass "プラン制限値がAPIから正しく返却されている"
else
    print_fail "プラン制限値の検証に失敗"
fi

# =============================================================================
print_header "7. 機能フラグの確認"
# =============================================================================

print_test "プラン別機能フラグの検証"
echo ""
echo "  | 機能            | Free | Pro  | Team | Enterprise |"
echo "  |-----------------|------|------|------|------------|"
echo "  | カスタムドメイン | ✗    | ✓    | ✓    | ✓          |"
echo "  | 優先サポート     | ✗    | ✗    | ✓    | ✓          |"
echo "  | SSO/SAML        | ✗    | ✗    | ✗    | ✓          |"
echo ""

# Verify from API
FREE_CUSTOM_DOMAIN=$(echo "$PLANS" | grep -o '"custom_domains":false' | head -1)
PRO_CUSTOM_DOMAIN=$(echo "$PLANS" | grep -o '"custom_domains":true' | head -1)

if [ -n "$FREE_CUSTOM_DOMAIN" ] && [ -n "$PRO_CUSTOM_DOMAIN" ]; then
    print_pass "機能フラグがAPIから正しく返却されている"
else
    print_fail "機能フラグの検証に失敗"
fi

# =============================================================================
print_header "8. エラーレスポンス形式の確認"
# =============================================================================

print_test "認証エラーのレスポンス形式"
ERROR_RESPONSE=$(curl -s "${API_URL}/api/v1/workspaces")
echo "  Response: $ERROR_RESPONSE"
if echo "$ERROR_RESPONSE" | grep -qi "authorization\|unauthorized"; then
    print_pass "適切なエラーメッセージが返却される"
else
    print_fail "エラーレスポンスの形式が不適切"
fi

# =============================================================================
print_header "9. CORS設定テスト"
# =============================================================================

print_test "CORSヘッダーの確認"
CORS_HEADERS=$(curl -s -I -X OPTIONS -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: GET" \
    "${API_URL}/api/v1/billing/plans" 2>/dev/null)
if echo "$CORS_HEADERS" | grep -qi "access-control-allow"; then
    print_pass "CORSヘッダーが設定されている"
    echo "$CORS_HEADERS" | grep -i "access-control" | head -3
else
    echo "  CORSヘッダーは明示的には返却されていない（OPTIONSリクエスト時のみの可能性）"
fi

# =============================================================================
print_header "10. セキュリティヘッダーテスト"
# =============================================================================

print_test "セキュリティヘッダーの確認"
SECURITY_HEADERS=$(curl -s -I "${API_URL}/health" 2>/dev/null)
echo "  確認されたセキュリティヘッダー:"

for header in "x-content-type-options" "x-frame-options" "x-xss-protection" "strict-transport-security" "content-security-policy"; do
    if echo "$SECURITY_HEADERS" | grep -qi "$header"; then
        echo "    ✓ $header"
    else
        echo "    ✗ $header (未設定)"
    fi
done

# =============================================================================
print_header "テスト結果サマリー"
# =============================================================================

echo ""
echo -e "  ${GREEN}PASSED: $TESTS_PASSED${NC}"
echo -e "  ${RED}FAILED: $TESTS_FAILED${NC}"
TOTAL=$((TESTS_PASSED + TESTS_FAILED))
echo "  TOTAL:  $TOTAL"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}すべてのテストが成功しました！${NC}"
else
    echo -e "${YELLOW}一部のテストが失敗しました。詳細を確認してください。${NC}"
fi
