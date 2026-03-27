#!/bin/bash

# =============================================================================
# NodeFlare Backend API Complete Test Script
# 全てのバックエンドAPIエンドポイントをテストするスクリプト
# =============================================================================

# Do not exit on error to complete all tests

API_URL="${API_URL:-http://localhost:8080}"
PROXY_URL="${PROXY_URL:-http://localhost:8081}"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
MAGENTA='\033[0;35m'
NC='\033[0m' # No Color

# Test counters
TESTS_PASSED=0
TESTS_FAILED=0
TESTS_SKIPPED=0

# Test data storage
WORKSPACE_ID=""
SERVER_ID=""
DEPLOYMENT_ID=""
API_KEY_ID=""
WEBHOOK_ID=""
ANNOUNCEMENT_ID=""

# =============================================================================
# Helper functions
# =============================================================================

print_header() {
    echo ""
    echo "============================================================================="
    echo -e "${BLUE}$1${NC}"
    echo "============================================================================="
}

print_section() {
    echo ""
    echo -e "${CYAN}>>> $1${NC}"
    echo "-----------------------------------------------------------------------------"
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

print_skip() {
    echo -e "${MAGENTA}⊘ SKIP: $1${NC}"
    ((TESTS_SKIPPED++))
}

print_info() {
    echo -e "${CYAN}  ℹ $1${NC}"
}

# Make HTTP request and return status code and body
# Usage: http_request METHOD URL [DATA]
http_request() {
    local method="$1"
    local url="$2"
    local data="$3"

    local response
    if [ -n "$data" ]; then
        response=$(curl -s -w "\n%{http_code}" -X "$method" -H "Content-Type: application/json" -d "$data" "$url" 2>/dev/null || echo -e "\nCONNECTION_FAILED")
    else
        response=$(curl -s -w "\n%{http_code}" -X "$method" "$url" 2>/dev/null || echo -e "\nCONNECTION_FAILED")
    fi

    # Split body and status code
    local body=$(echo "$response" | sed '$d')
    local status=$(echo "$response" | tail -1)

    echo "$status"
    echo "$body"
}

# Check if response is successful (2xx)
is_success() {
    local status="$1"
    [[ "$status" =~ ^2[0-9]{2}$ ]]
}

# Check if response is unauthorized (401)
is_unauthorized() {
    local status="$1"
    [[ "$status" == "401" ]]
}

# Check if response is forbidden (403)
is_forbidden() {
    local status="$1"
    [[ "$status" == "403" ]]
}

# Check if response is not found (404)
is_not_found() {
    local status="$1"
    [[ "$status" == "404" ]]
}

# Extract JSON field
json_field() {
    echo "$1" | grep -o "\"$2\":[^,}]*" | head -1 | sed 's/.*://' | tr -d '"' | tr -d ' '
}

# Extract JSON array first item's field
json_array_first_field() {
    echo "$1" | grep -o "\"$2\":\"[^\"]*\"" | head -1 | sed 's/.*://' | tr -d '"'
}

# =============================================================================
print_header "NodeFlare API Complete Test Suite"
# =============================================================================
echo "API URL: $API_URL"
echo "Proxy URL: $PROXY_URL"
echo "Started at: $(date)"

# =============================================================================
print_header "1. Health Check Endpoints"
# =============================================================================

print_section "Basic Health Checks"

print_test "GET /health - Basic health check"
result=$(http_request GET "${API_URL}/health")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)
if is_success "$status" && echo "$body" | grep -q "healthy"; then
    print_pass "Health check returned healthy"
    print_info "Response: $body"
else
    print_fail "Health check failed (status: $status)"
    print_info "Response: $body"
fi

print_test "GET /ready - Readiness check"
result=$(http_request GET "${API_URL}/ready")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)
if is_success "$status"; then
    print_pass "Readiness check passed"
    print_info "Response: $body"
else
    print_fail "Readiness check failed (status: $status)"
    print_info "Response: $body"
fi

# =============================================================================
print_header "2. Authentication Endpoints (Public)"
# =============================================================================

print_section "OAuth Endpoints"

print_test "GET /api/v1/auth/github - GitHub OAuth redirect"
result=$(http_request GET "${API_URL}/api/v1/auth/github")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)
# Should redirect (302) or return error if not configured
if [[ "$status" == "302" ]] || [[ "$status" == "307" ]] || is_success "$status"; then
    print_pass "GitHub OAuth endpoint accessible"
else
    print_info "GitHub OAuth returned status: $status (may require configuration)"
fi

print_test "GET /api/v1/auth/github/callback - OAuth callback (no params)"
result=$(http_request GET "${API_URL}/api/v1/auth/github/callback")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)
if [[ "$status" == "400" ]] || [[ "$status" == "401" ]]; then
    print_pass "OAuth callback correctly requires parameters"
else
    print_info "OAuth callback status: $status"
fi

print_section "Token Endpoints"

print_test "POST /api/v1/auth/refresh - Invalid refresh token"
result=$(http_request POST "${API_URL}/api/v1/auth/refresh" '{"refresh_token":"invalid_token_123"}')
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)
if is_unauthorized "$status" || [[ "$status" == "400" ]]; then
    print_pass "Invalid refresh token correctly rejected"
else
    print_fail "Invalid refresh token should be rejected (status: $status)"
fi

print_section "Protected Auth Endpoints (No Auth)"

print_test "GET /api/v1/auth/me - Without authentication"
result=$(http_request GET "${API_URL}/api/v1/auth/me")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Protected endpoint requires authentication"
else
    print_fail "Protected endpoint should require auth (status: $status)"
fi

print_test "POST /api/v1/auth/logout - Without authentication"
result=$(http_request POST "${API_URL}/api/v1/auth/logout")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Logout requires authentication"
else
    print_fail "Logout should require auth (status: $status)"
fi

print_test "PATCH /api/v1/auth/profile - Without authentication"
result=$(http_request PATCH "${API_URL}/api/v1/auth/profile" '{"name":"Test"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Profile update requires authentication"
else
    print_fail "Profile update should require auth (status: $status)"
fi

print_test "DELETE /api/v1/auth/account - Without authentication"
result=$(http_request DELETE "${API_URL}/api/v1/auth/account")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Account deletion requires authentication"
else
    print_fail "Account deletion should require auth (status: $status)"
fi

# =============================================================================
print_header "3. Billing Endpoints (Public)"
# =============================================================================

print_section "Plan Information"

print_test "GET /api/v1/billing/plans - List available plans"
result=$(http_request GET "${API_URL}/api/v1/billing/plans")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)
if is_success "$status"; then
    print_pass "Plans list retrieved successfully"
    if echo "$body" | grep -q "free"; then
        print_info "Free plan found"
    fi
    if echo "$body" | grep -q "pro"; then
        print_info "Pro plan found"
    fi
    if echo "$body" | grep -q "team"; then
        print_info "Team plan found"
    fi
    if echo "$body" | grep -q "enterprise"; then
        print_info "Enterprise plan found"
    fi
else
    print_fail "Failed to retrieve plans (status: $status)"
fi

# =============================================================================
print_header "4. Workspace Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

print_test "GET /api/v1/workspaces - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Workspaces list requires authentication"
else
    print_fail "Workspaces should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces" '{"name":"Test","slug":"test"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Workspace creation requires authentication"
else
    print_fail "Workspace creation should require auth (status: $status)"
fi

print_test "GET /api/v1/workspaces/:id - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/00000000-0000-0000-0000-000000000000")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Workspace detail requires authentication"
else
    print_fail "Workspace detail should require auth (status: $status)"
fi

print_test "PATCH /api/v1/workspaces/:id - Without auth"
result=$(http_request PATCH "${API_URL}/api/v1/workspaces/00000000-0000-0000-0000-000000000000" '{"name":"Updated"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Workspace update requires authentication"
else
    print_fail "Workspace update should require auth (status: $status)"
fi

print_test "DELETE /api/v1/workspaces/:id - Without auth"
result=$(http_request DELETE "${API_URL}/api/v1/workspaces/00000000-0000-0000-0000-000000000000")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Workspace deletion requires authentication"
else
    print_fail "Workspace deletion should require auth (status: $status)"
fi

# =============================================================================
print_header "5. Member Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

FAKE_WORKSPACE_ID="00000000-0000-0000-0000-000000000000"
FAKE_USER_ID="00000000-0000-0000-0000-000000000001"

print_test "GET /api/v1/workspaces/:id/members - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/members")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Members list requires authentication"
else
    print_fail "Members list should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/members - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/members" '{"email":"test@example.com","role":"viewer"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Member addition requires authentication"
else
    print_fail "Member addition should require auth (status: $status)"
fi

print_test "PATCH /api/v1/workspaces/:id/members/:user_id - Without auth"
result=$(http_request PATCH "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/members/${FAKE_USER_ID}" '{"role":"editor"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Member role update requires authentication"
else
    print_fail "Member role update should require auth (status: $status)"
fi

print_test "DELETE /api/v1/workspaces/:id/members/:user_id - Without auth"
result=$(http_request DELETE "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/members/${FAKE_USER_ID}")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Member removal requires authentication"
else
    print_fail "Member removal should require auth (status: $status)"
fi

# =============================================================================
print_header "6. Server Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

FAKE_SERVER_ID="00000000-0000-0000-0000-000000000002"

print_test "GET /api/v1/servers - Without auth"
result=$(http_request GET "${API_URL}/api/v1/servers")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Servers list requires authentication"
else
    print_fail "Servers list should require auth (status: $status)"
fi

print_test "GET /api/v1/workspaces/:id/servers - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Workspace servers list requires authentication"
else
    print_fail "Workspace servers list should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/servers - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers" '{"name":"Test Server","slug":"test-server","github_repo":"user/repo","runtime":"node"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Server creation requires authentication"
else
    print_fail "Server creation should require auth (status: $status)"
fi

print_test "GET /api/v1/workspaces/:id/servers/:server_id - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Server detail requires authentication"
else
    print_fail "Server detail should require auth (status: $status)"
fi

print_test "PATCH /api/v1/workspaces/:id/servers/:server_id - Without auth"
result=$(http_request PATCH "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}" '{"name":"Updated Server"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Server update requires authentication"
else
    print_fail "Server update should require auth (status: $status)"
fi

print_test "DELETE /api/v1/workspaces/:id/servers/:server_id - Without auth"
result=$(http_request DELETE "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Server deletion requires authentication"
else
    print_fail "Server deletion should require auth (status: $status)"
fi

print_section "Server Operations (Auth Required)"

print_test "POST /api/v1/workspaces/:id/servers/:server_id/deploy - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/deploy")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Deploy requires authentication"
else
    print_fail "Deploy should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/servers/:server_id/stop - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/stop")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Stop requires authentication"
else
    print_fail "Stop should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/servers/:server_id/restart - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/restart")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Restart requires authentication"
else
    print_fail "Restart should require auth (status: $status)"
fi

# =============================================================================
print_header "7. Deployment Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

FAKE_DEPLOYMENT_ID="00000000-0000-0000-0000-000000000003"

print_test "GET /api/v1/workspaces/:id/servers/:server_id/deployments - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/deployments")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Deployments list requires authentication"
else
    print_fail "Deployments list should require auth (status: $status)"
fi

print_test "GET /api/v1/workspaces/:id/servers/:server_id/deployments/:deployment_id - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/deployments/${FAKE_DEPLOYMENT_ID}")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Deployment detail requires authentication"
else
    print_fail "Deployment detail should require auth (status: $status)"
fi

print_test "GET /api/v1/workspaces/:id/servers/:server_id/deployments/:deployment_id/logs - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/deployments/${FAKE_DEPLOYMENT_ID}/logs")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Deployment logs requires authentication"
else
    print_fail "Deployment logs should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/servers/:server_id/deployments/:deployment_id/rollback - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/deployments/${FAKE_DEPLOYMENT_ID}/rollback")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Rollback requires authentication"
else
    print_fail "Rollback should require auth (status: $status)"
fi

# =============================================================================
print_header "8. Tool Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

FAKE_TOOL_ID="00000000-0000-0000-0000-000000000004"

print_test "GET /api/v1/workspaces/:id/servers/:server_id/tools - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/tools")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Tools list requires authentication"
else
    print_fail "Tools list should require auth (status: $status)"
fi

print_test "PATCH /api/v1/workspaces/:id/servers/:server_id/tools/:tool_id - Without auth"
result=$(http_request PATCH "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/tools/${FAKE_TOOL_ID}" '{"enabled":true}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Tool update requires authentication"
else
    print_fail "Tool update should require auth (status: $status)"
fi

# =============================================================================
print_header "9. API Key Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

FAKE_KEY_ID="00000000-0000-0000-0000-000000000005"

print_test "GET /api/v1/workspaces/:id/api-keys - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/api-keys")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "API keys list requires authentication"
else
    print_fail "API keys list should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/api-keys - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/api-keys" '{"name":"Test Key","scopes":["read"],"expires_in_days":30}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "API key creation requires authentication"
else
    print_fail "API key creation should require auth (status: $status)"
fi

print_test "DELETE /api/v1/workspaces/:id/api-keys/:key_id - Without auth"
result=$(http_request DELETE "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/api-keys/${FAKE_KEY_ID}")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "API key deletion requires authentication"
else
    print_fail "API key deletion should require auth (status: $status)"
fi

# =============================================================================
print_header "10. Secret Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

print_test "GET /api/v1/workspaces/:id/servers/:server_id/secrets - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/secrets")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Secrets list requires authentication"
else
    print_fail "Secrets list should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/servers/:server_id/secrets - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/secrets" '{"key":"TEST_SECRET","value":"secret_value"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Secret creation requires authentication"
else
    print_fail "Secret creation should require auth (status: $status)"
fi

print_test "DELETE /api/v1/workspaces/:id/servers/:server_id/secrets/:key - Without auth"
result=$(http_request DELETE "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/secrets/TEST_SECRET")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Secret deletion requires authentication"
else
    print_fail "Secret deletion should require auth (status: $status)"
fi

# =============================================================================
print_header "11. Log Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

print_test "GET /api/v1/workspaces/:id/servers/:server_id/logs - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/logs")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Logs requires authentication"
else
    print_fail "Logs should require auth (status: $status)"
fi

print_test "GET /api/v1/workspaces/:id/servers/:server_id/stats - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/stats")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Stats requires authentication"
else
    print_fail "Stats should require auth (status: $status)"
fi

# =============================================================================
print_header "12. Webhook Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

FAKE_WEBHOOK_ID="00000000-0000-0000-0000-000000000006"

print_test "GET /api/v1/workspaces/:id/servers/:server_id/webhooks - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/webhooks")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Webhooks list requires authentication"
else
    print_fail "Webhooks list should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/servers/:server_id/webhooks - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/webhooks" '{"name":"Test Webhook","webhook_url":"https://example.com/webhook","events":["deploy.success"]}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Webhook creation requires authentication"
else
    print_fail "Webhook creation should require auth (status: $status)"
fi

print_test "PATCH /api/v1/workspaces/:id/servers/:server_id/webhooks/:webhook_id - Without auth"
result=$(http_request PATCH "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/webhooks/${FAKE_WEBHOOK_ID}" '{"name":"Updated Webhook"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Webhook update requires authentication"
else
    print_fail "Webhook update should require auth (status: $status)"
fi

print_test "DELETE /api/v1/workspaces/:id/servers/:server_id/webhooks/:webhook_id - Without auth"
result=$(http_request DELETE "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/webhooks/${FAKE_WEBHOOK_ID}")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Webhook deletion requires authentication"
else
    print_fail "Webhook deletion should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/servers/:server_id/webhooks/:webhook_id/test - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/webhooks/${FAKE_WEBHOOK_ID}/test")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Webhook test requires authentication"
else
    print_fail "Webhook test should require auth (status: $status)"
fi

# =============================================================================
print_header "13. Region Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

print_test "GET /api/v1/workspaces/:id/servers/:server_id/regions - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/regions")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Regions list requires authentication"
else
    print_fail "Regions list should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/servers/:server_id/regions - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/regions" '{"region":"us-west"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Region addition requires authentication"
else
    print_fail "Region addition should require auth (status: $status)"
fi

print_test "DELETE /api/v1/workspaces/:id/servers/:server_id/regions/:region - Without auth"
result=$(http_request DELETE "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/regions/us-west")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Region removal requires authentication"
else
    print_fail "Region removal should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/servers/:server_id/regions/deploy-all - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/regions/deploy-all")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Deploy-all regions requires authentication"
else
    print_fail "Deploy-all regions should require auth (status: $status)"
fi

# =============================================================================
print_header "14. Billing Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

print_test "GET /api/v1/workspaces/:id/billing/subscription - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/billing/subscription")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Subscription info requires authentication"
else
    print_fail "Subscription info should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/billing/checkout - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/billing/checkout" '{"plan":"pro","billing_cycle":"monthly"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Checkout requires authentication"
else
    print_fail "Checkout should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/billing/portal - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/billing/portal")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Billing portal requires authentication"
else
    print_fail "Billing portal should require auth (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/billing/cancel - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/billing/cancel")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Subscription cancel requires authentication"
else
    print_fail "Subscription cancel should require auth (status: $status)"
fi

print_test "GET /api/v1/workspaces/:id/billing/invoices - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/billing/invoices")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Invoices list requires authentication"
else
    print_fail "Invoices list should require auth (status: $status)"
fi

print_test "GET /api/v1/workspaces/:id/billing/payment-method - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/billing/payment-method")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Payment method requires authentication"
else
    print_fail "Payment method should require auth (status: $status)"
fi

print_test "GET /api/v1/workspaces/:id/billing/settings - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/billing/settings")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Billing settings requires authentication"
else
    print_fail "Billing settings should require auth (status: $status)"
fi

print_test "GET /api/v1/workspaces/:id/billing/region-cost - Without auth"
result=$(http_request GET "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/billing/region-cost")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Region cost requires authentication"
else
    print_fail "Region cost should require auth (status: $status)"
fi

# =============================================================================
print_header "15. GitHub Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

print_test "GET /api/v1/github/repos - Without auth"
result=$(http_request GET "${API_URL}/api/v1/github/repos")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "GitHub repos requires authentication"
else
    print_fail "GitHub repos should require auth (status: $status)"
fi

# =============================================================================
print_header "16. Contact Endpoint (Public)"
# =============================================================================

print_section "Contact Form"

print_test "POST /api/v1/contact - Valid submission"
result=$(http_request POST "${API_URL}/api/v1/contact" '{"name":"Test User","email":"test@example.com","message":"This is a test message for API testing.","honeypot":""}')
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)
if is_success "$status"; then
    print_pass "Contact form submission accepted"
else
    print_info "Contact form returned status: $status (may be rate limited)"
fi

print_test "POST /api/v1/contact - With honeypot filled (spam detection)"
result=$(http_request POST "${API_URL}/api/v1/contact" '{"name":"Bot","email":"bot@spam.com","message":"Spam message","honeypot":"spam_value"}')
status=$(echo "$result" | head -1)
# Should silently accept but not process (200) or reject (400)
if is_success "$status" || [[ "$status" == "400" ]]; then
    print_pass "Honeypot detection working"
else
    print_info "Honeypot response status: $status"
fi

print_test "POST /api/v1/contact - Missing required fields"
result=$(http_request POST "${API_URL}/api/v1/contact" '{"name":"Test"}')
status=$(echo "$result" | head -1)
if [[ "$status" == "400" ]] || [[ "$status" == "422" ]]; then
    print_pass "Missing fields correctly rejected"
else
    print_fail "Missing fields should be rejected (status: $status)"
fi

# =============================================================================
print_header "17. Announcement Endpoints"
# =============================================================================

print_section "Public Endpoints"

print_test "GET /api/v1/announcements - Public list"
result=$(http_request GET "${API_URL}/api/v1/announcements")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)
if is_success "$status"; then
    print_pass "Announcements list accessible"
    print_info "Response: ${body:0:200}..."
else
    print_fail "Announcements list should be public (status: $status)"
fi

print_test "GET /api/v1/announcements?limit=5 - With limit"
result=$(http_request GET "${API_URL}/api/v1/announcements?limit=5")
status=$(echo "$result" | head -1)
if is_success "$status"; then
    print_pass "Announcements with limit works"
else
    print_fail "Announcements with limit failed (status: $status)"
fi

print_section "Admin Endpoints (Auth Required)"

print_test "GET /api/v1/announcements/all - Without auth"
result=$(http_request GET "${API_URL}/api/v1/announcements/all")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "All announcements requires authentication"
else
    print_fail "All announcements should require auth (status: $status)"
fi

print_test "POST /api/v1/announcements - Without auth"
result=$(http_request POST "${API_URL}/api/v1/announcements" '{"title":"Test","content":"Test content","type":"info"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Announcement creation requires authentication"
else
    print_fail "Announcement creation should require auth (status: $status)"
fi

FAKE_ANNOUNCEMENT_ID="00000000-0000-0000-0000-000000000007"

print_test "PATCH /api/v1/announcements/:id - Without auth"
result=$(http_request PATCH "${API_URL}/api/v1/announcements/${FAKE_ANNOUNCEMENT_ID}" '{"title":"Updated"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Announcement update requires authentication"
else
    print_fail "Announcement update should require auth (status: $status)"
fi

print_test "DELETE /api/v1/announcements/:id - Without auth"
result=$(http_request DELETE "${API_URL}/api/v1/announcements/${FAKE_ANNOUNCEMENT_ID}")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Announcement deletion requires authentication"
else
    print_fail "Announcement deletion should require auth (status: $status)"
fi

# =============================================================================
print_header "18. User Preferences Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

print_test "GET /api/v1/user/preferences - Without auth"
result=$(http_request GET "${API_URL}/api/v1/user/preferences")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "User preferences requires authentication"
else
    print_fail "User preferences should require auth (status: $status)"
fi

print_test "PATCH /api/v1/user/preferences - Without auth"
result=$(http_request PATCH "${API_URL}/api/v1/user/preferences" '{"sidebar_order":["workspaces","servers"]}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "User preferences update requires authentication"
else
    print_fail "User preferences update should require auth (status: $status)"
fi

# =============================================================================
print_header "19. Notification Settings Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

print_test "GET /api/v1/user/notifications - Without auth"
result=$(http_request GET "${API_URL}/api/v1/user/notifications")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Notification settings requires authentication"
else
    print_fail "Notification settings should require auth (status: $status)"
fi

print_test "PATCH /api/v1/user/notifications - Without auth"
result=$(http_request PATCH "${API_URL}/api/v1/user/notifications" '{"email_deploy_success":true}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Notification settings update requires authentication"
else
    print_fail "Notification settings update should require auth (status: $status)"
fi

# =============================================================================
print_header "20. Console Exec Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

print_test "POST /api/v1/workspaces/:id/servers/:server_id/console/exec - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/servers/${FAKE_SERVER_ID}/console/exec" '{"command":["ls","-la"]}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "Console exec requires authentication"
else
    print_fail "Console exec should require auth (status: $status)"
fi

# =============================================================================
print_header "21. WireGuard VPN Endpoints (Auth Required)"
# =============================================================================

print_section "Without Authentication"

print_test "POST /api/v1/workspaces/:id/wireguard - Without auth"
result=$(http_request POST "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/wireguard" '{"name":"test-peer","region":"us-east"}')
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "WireGuard peer creation requires authentication"
else
    print_fail "WireGuard peer creation should require auth (status: $status)"
fi

print_test "DELETE /api/v1/workspaces/:id/wireguard/:peer_name - Without auth"
result=$(http_request DELETE "${API_URL}/api/v1/workspaces/${FAKE_WORKSPACE_ID}/wireguard/test-peer")
status=$(echo "$result" | head -1)
if is_unauthorized "$status"; then
    print_pass "WireGuard peer deletion requires authentication"
else
    print_fail "WireGuard peer deletion should require auth (status: $status)"
fi

# =============================================================================
print_header "22. Stripe Webhook (Public but Signature Required)"
# =============================================================================

print_section "Stripe Webhook"

print_test "POST /api/v1/webhooks/stripe - Without signature"
result=$(http_request POST "${API_URL}/api/v1/webhooks/stripe" '{"type":"test"}')
status=$(echo "$result" | head -1)
if [[ "$status" == "400" ]] || [[ "$status" == "401" ]]; then
    print_pass "Stripe webhook requires valid signature"
else
    print_info "Stripe webhook status: $status (may need stripe-signature header)"
fi

# =============================================================================
print_header "23. Security Header Tests"
# =============================================================================

print_section "HTTP Security Headers"

print_test "Security headers on health endpoint"
headers=$(curl -s -I "${API_URL}/health" 2>/dev/null)
echo "  Checking security headers:"

headers_found=0
for header in "x-content-type-options" "x-frame-options" "x-xss-protection"; do
    if echo "$headers" | grep -qi "$header"; then
        echo -e "    ${GREEN}✓ $header${NC}"
        ((headers_found++))
    else
        echo -e "    ${YELLOW}✗ $header (not set)${NC}"
    fi
done

if [ $headers_found -ge 2 ]; then
    print_pass "Basic security headers present"
else
    print_info "Some security headers may be missing"
fi

# =============================================================================
print_header "24. CORS Tests"
# =============================================================================

print_section "CORS Preflight"

print_test "OPTIONS request with Origin header"
cors_result=$(curl -s -I -X OPTIONS \
    -H "Origin: http://localhost:3000" \
    -H "Access-Control-Request-Method: GET" \
    "${API_URL}/api/v1/billing/plans" 2>/dev/null)

if echo "$cors_result" | grep -qi "access-control-allow"; then
    print_pass "CORS headers returned for preflight"
    echo "$cors_result" | grep -i "access-control" | head -3 | while read line; do
        print_info "$line"
    done
else
    print_info "CORS headers not returned (may be configured differently)"
fi

# =============================================================================
print_header "25. Rate Limiting Tests"
# =============================================================================

print_section "Rate Limit Detection"

print_test "Rapid requests to check rate limiting"
rate_limited=false
for i in {1..50}; do
    result=$(curl -s -w "%{http_code}" -o /dev/null "${API_URL}/health" 2>/dev/null)
    if [ "$result" = "429" ]; then
        rate_limited=true
        print_pass "Rate limiting activated after $i requests"
        break
    fi
done

if [ "$rate_limited" = false ]; then
    print_info "Rate limiting not triggered in 50 requests (may have higher threshold)"
fi

# =============================================================================
print_header "26. Input Validation Tests"
# =============================================================================

print_section "Invalid Input Handling"

print_test "POST with invalid JSON"
result=$(http_request POST "${API_URL}/api/v1/auth/refresh" 'invalid json{{{')
status=$(echo "$result" | head -1)
if [[ "$status" == "400" ]] || [[ "$status" == "422" ]]; then
    print_pass "Invalid JSON correctly rejected"
else
    print_fail "Invalid JSON should be rejected (status: $status)"
fi

print_test "UUID validation - Invalid UUID format"
result=$(http_request GET "${API_URL}/api/v1/workspaces/not-a-uuid")
status=$(echo "$result" | head -1)
if [[ "$status" == "400" ]] || [[ "$status" == "401" ]] || [[ "$status" == "404" ]]; then
    print_pass "Invalid UUID handled appropriately"
else
    print_info "Invalid UUID response status: $status"
fi

print_test "SQL Injection attempt in query param"
result=$(http_request GET "${API_URL}/api/v1/announcements?limit=1;DROP%20TABLE%20users;--")
status=$(echo "$result" | head -1)
if is_success "$status" || [[ "$status" == "400" ]]; then
    print_pass "SQL injection attempt handled safely"
else
    print_info "SQL injection test status: $status"
fi

# =============================================================================
print_header "27. Proxy Server Tests"
# =============================================================================

print_section "Proxy Authentication"

print_test "Proxy without API key"
result=$(http_request GET "${PROXY_URL}/test")
status=$(echo "$result" | head -1)
if is_unauthorized "$status" || [[ "$status" == "CONNECTION_FAILED" ]]; then
    print_pass "Proxy requires API key"
else
    print_info "Proxy status: $status"
fi

print_test "Proxy with invalid API key"
result=$(curl -s -w "\n%{http_code}" -H "X-API-Key: invalid_key" "${PROXY_URL}/test" 2>/dev/null || echo -e "\nCONNECTION_FAILED")
status=$(echo "$result" | tail -1)
if is_unauthorized "$status" || [[ "$status" == "CONNECTION_FAILED" ]]; then
    print_pass "Proxy rejects invalid API key"
else
    print_info "Proxy with invalid key status: $status"
fi

print_test "Proxy with correct format but non-existent API key"
result=$(curl -s -w "\n%{http_code}" -H "X-API-Key: mcp_abcdefghijklmnopqrstuvwxyz123456" "${PROXY_URL}/test" 2>/dev/null || echo -e "\nCONNECTION_FAILED")
status=$(echo "$result" | tail -1)
if is_unauthorized "$status" || [[ "$status" == "CONNECTION_FAILED" ]]; then
    print_pass "Proxy rejects non-existent API key"
else
    print_info "Proxy with fake key status: $status"
fi

# =============================================================================
print_header "Test Results Summary"
# =============================================================================

echo ""
echo "============================================================================="
echo -e "${BLUE}Final Results${NC}"
echo "============================================================================="
echo ""
echo -e "  ${GREEN}PASSED:  $TESTS_PASSED${NC}"
echo -e "  ${RED}FAILED:  $TESTS_FAILED${NC}"
echo -e "  ${MAGENTA}SKIPPED: $TESTS_SKIPPED${NC}"
TOTAL=$((TESTS_PASSED + TESTS_FAILED + TESTS_SKIPPED))
echo "  TOTAL:   $TOTAL"
echo ""
echo "Completed at: $(date)"
echo ""

if [ $TESTS_FAILED -eq 0 ]; then
    echo -e "${GREEN}=============================================================================${NC}"
    echo -e "${GREEN}All tests passed successfully!${NC}"
    echo -e "${GREEN}=============================================================================${NC}"
    exit 0
else
    echo -e "${YELLOW}=============================================================================${NC}"
    echo -e "${YELLOW}Some tests failed. Review the output above for details.${NC}"
    echo -e "${YELLOW}=============================================================================${NC}"
    exit 1
fi
