#!/bin/bash

# =============================================================================
# NodeFlare Authenticated API Test Script
# 認証トークンを使用して保護されたエンドポイントをテストするスクリプト
# =============================================================================

set -e

API_URL="${API_URL:-http://localhost:8080}"

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

# =============================================================================
# Configuration
# =============================================================================

# Set your access token here or via environment variable
ACCESS_TOKEN="${ACCESS_TOKEN:-}"

if [ -z "$ACCESS_TOKEN" ]; then
    echo -e "${RED}Error: ACCESS_TOKEN environment variable is required${NC}"
    echo ""
    echo "Usage: ACCESS_TOKEN=your_jwt_token ./test_authenticated_api.sh"
    echo ""
    echo "To get an access token:"
    echo "  1. Log in via GitHub OAuth in the web app"
    echo "  2. Extract the token from cookies or local storage"
    echo "  3. Or use the generate_test_token.rs script"
    exit 1
fi

AUTH_HEADER="Authorization: Bearer $ACCESS_TOKEN"

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

# Make authenticated HTTP request
auth_request() {
    local method="$1"
    local url="$2"
    local data="$3"

    local curl_args=(-s -w "\n%{http_code}" -X "$method" -H "$AUTH_HEADER")

    if [ -n "$data" ]; then
        curl_args+=(-H "Content-Type: application/json" -d "$data")
    fi

    curl_args+=("$url")

    local response
    response=$(curl "${curl_args[@]}" 2>/dev/null || echo -e "\nCONNECTION_FAILED")

    local body=$(echo "$response" | sed '$d')
    local status=$(echo "$response" | tail -1)

    echo "$status"
    echo "$body"
}

is_success() {
    [[ "$1" =~ ^2[0-9]{2}$ ]]
}

# =============================================================================
print_header "NodeFlare Authenticated API Test Suite"
# =============================================================================
echo "API URL: $API_URL"
echo "Started at: $(date)"
echo ""

# =============================================================================
print_header "1. Authentication Verification"
# =============================================================================

print_section "Verify Token"

print_test "GET /api/v1/auth/me - Get current user"
result=$(auth_request GET "${API_URL}/api/v1/auth/me")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)

if is_success "$status"; then
    print_pass "Token is valid"
    USER_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
    USER_NAME=$(echo "$body" | grep -o '"name":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
    USER_EMAIL=$(echo "$body" | grep -o '"email":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
    print_info "User ID: $USER_ID"
    print_info "User Name: $USER_NAME"
    print_info "User Email: $USER_EMAIL"
else
    print_fail "Token validation failed (status: $status)"
    print_info "Response: $body"
    echo ""
    echo -e "${RED}Cannot continue without valid token. Exiting.${NC}"
    exit 1
fi

# =============================================================================
print_header "2. Workspace Operations"
# =============================================================================

print_section "List and Create Workspaces"

print_test "GET /api/v1/workspaces - List workspaces"
result=$(auth_request GET "${API_URL}/api/v1/workspaces")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)

if is_success "$status"; then
    print_pass "Workspaces list retrieved"
    WORKSPACE_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
    if [ -n "$WORKSPACE_ID" ]; then
        print_info "Found workspace ID: $WORKSPACE_ID"
    else
        print_info "No existing workspaces found"
    fi
else
    print_fail "Failed to list workspaces (status: $status)"
fi

# Create a test workspace if none exists
if [ -z "$WORKSPACE_ID" ]; then
    print_test "POST /api/v1/workspaces - Create test workspace"
    RANDOM_SLUG="test-ws-$(date +%s)"
    result=$(auth_request POST "${API_URL}/api/v1/workspaces" "{\"name\":\"Test Workspace\",\"slug\":\"$RANDOM_SLUG\"}")
    status=$(echo "$result" | head -1)
    body=$(echo "$result" | tail -n +2)

    if is_success "$status"; then
        print_pass "Test workspace created"
        WORKSPACE_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
        print_info "Created workspace ID: $WORKSPACE_ID"
    else
        print_fail "Failed to create workspace (status: $status)"
        print_info "Response: $body"
    fi
fi

if [ -z "$WORKSPACE_ID" ]; then
    echo -e "${RED}No workspace available for testing. Exiting.${NC}"
    exit 1
fi

print_test "GET /api/v1/workspaces/:id - Get workspace details"
result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)

if is_success "$status"; then
    print_pass "Workspace details retrieved"
    WS_NAME=$(echo "$body" | grep -o '"name":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
    print_info "Workspace name: $WS_NAME"
else
    print_fail "Failed to get workspace details (status: $status)"
fi

print_test "PATCH /api/v1/workspaces/:id - Update workspace"
result=$(auth_request PATCH "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}" '{"name":"Updated Test Workspace"}')
status=$(echo "$result" | head -1)

if is_success "$status"; then
    print_pass "Workspace updated successfully"
else
    print_fail "Failed to update workspace (status: $status)"
fi

# =============================================================================
print_header "3. Member Operations"
# =============================================================================

print_section "Workspace Members"

print_test "GET /api/v1/workspaces/:id/members - List members"
result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/members")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)

if is_success "$status"; then
    print_pass "Members list retrieved"
    MEMBER_COUNT=$(echo "$body" | grep -o '"id"' | wc -l)
    print_info "Found $MEMBER_COUNT member(s)"
else
    print_fail "Failed to list members (status: $status)"
fi

# =============================================================================
print_header "4. Server Operations"
# =============================================================================

print_section "Server Management"

print_test "GET /api/v1/servers - List all servers"
result=$(auth_request GET "${API_URL}/api/v1/servers")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)

if is_success "$status"; then
    print_pass "All servers list retrieved"
else
    print_fail "Failed to list all servers (status: $status)"
fi

print_test "GET /api/v1/workspaces/:id/servers - List workspace servers"
result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)

if is_success "$status"; then
    print_pass "Workspace servers list retrieved"
    SERVER_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
    if [ -n "$SERVER_ID" ]; then
        print_info "Found server ID: $SERVER_ID"
    else
        print_info "No existing servers found"
    fi
else
    print_fail "Failed to list workspace servers (status: $status)"
fi

# Create a test server if none exists
if [ -z "$SERVER_ID" ]; then
    print_test "POST /api/v1/workspaces/:id/servers - Create test server"
    RANDOM_SLUG="test-server-$(date +%s)"
    result=$(auth_request POST "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers" "{\"name\":\"Test Server\",\"slug\":\"$RANDOM_SLUG\",\"github_repo\":\"example/test-repo\",\"runtime\":\"node\"}")
    status=$(echo "$result" | head -1)
    body=$(echo "$result" | tail -n +2)

    if is_success "$status"; then
        print_pass "Test server created"
        SERVER_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
        print_info "Created server ID: $SERVER_ID"
    else
        print_info "Server creation returned status: $status"
        print_info "Response: ${body:0:200}"
    fi
fi

if [ -n "$SERVER_ID" ]; then
    print_test "GET /api/v1/workspaces/:id/servers/:server_id - Get server details"
    result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}")
    status=$(echo "$result" | head -1)
    body=$(echo "$result" | tail -n +2)

    if is_success "$status"; then
        print_pass "Server details retrieved"
        SERVER_NAME=$(echo "$body" | grep -o '"name":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
        print_info "Server name: $SERVER_NAME"
    else
        print_fail "Failed to get server details (status: $status)"
    fi

    print_test "PATCH /api/v1/workspaces/:id/servers/:server_id - Update server"
    result=$(auth_request PATCH "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}" '{"name":"Updated Test Server"}')
    status=$(echo "$result" | head -1)

    if is_success "$status"; then
        print_pass "Server updated successfully"
    else
        print_info "Server update returned status: $status"
    fi
fi

# =============================================================================
print_header "5. Deployment Operations"
# =============================================================================

if [ -n "$SERVER_ID" ]; then
    print_section "Deployments"

    print_test "GET /api/v1/workspaces/:id/servers/:server_id/deployments - List deployments"
    result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/deployments")
    status=$(echo "$result" | head -1)
    body=$(echo "$result" | tail -n +2)

    if is_success "$status"; then
        print_pass "Deployments list retrieved"
        DEPLOYMENT_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
        if [ -n "$DEPLOYMENT_ID" ]; then
            print_info "Found deployment ID: $DEPLOYMENT_ID"
        fi
    else
        print_fail "Failed to list deployments (status: $status)"
    fi

    if [ -n "$DEPLOYMENT_ID" ]; then
        print_test "GET /api/v1/workspaces/:id/servers/:server_id/deployments/:deployment_id - Get deployment"
        result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/deployments/${DEPLOYMENT_ID}")
        status=$(echo "$result" | head -1)

        if is_success "$status"; then
            print_pass "Deployment details retrieved"
        else
            print_fail "Failed to get deployment details (status: $status)"
        fi

        print_test "GET /api/v1/workspaces/:id/servers/:server_id/deployments/:deployment_id/logs - Get deployment logs"
        result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/deployments/${DEPLOYMENT_ID}/logs")
        status=$(echo "$result" | head -1)

        if is_success "$status"; then
            print_pass "Deployment logs retrieved"
        else
            print_info "Deployment logs returned status: $status"
        fi
    fi
else
    print_skip "No server available for deployment tests"
fi

# =============================================================================
print_header "6. Tool Operations"
# =============================================================================

if [ -n "$SERVER_ID" ]; then
    print_section "Server Tools"

    print_test "GET /api/v1/workspaces/:id/servers/:server_id/tools - List tools"
    result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/tools")
    status=$(echo "$result" | head -1)
    body=$(echo "$result" | tail -n +2)

    if is_success "$status"; then
        print_pass "Tools list retrieved"
        TOOL_COUNT=$(echo "$body" | grep -o '"id"' | wc -l)
        print_info "Found $TOOL_COUNT tool(s)"
    else
        print_info "Tools list returned status: $status"
    fi
else
    print_skip "No server available for tool tests"
fi

# =============================================================================
print_header "7. API Key Operations"
# =============================================================================

print_section "API Keys"

print_test "GET /api/v1/workspaces/:id/api-keys - List API keys"
result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/api-keys")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)

if is_success "$status"; then
    print_pass "API keys list retrieved"
    KEY_COUNT=$(echo "$body" | grep -o '"id"' | wc -l)
    print_info "Found $KEY_COUNT API key(s)"
else
    print_fail "Failed to list API keys (status: $status)"
fi

print_test "POST /api/v1/workspaces/:id/api-keys - Create API key"
result=$(auth_request POST "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/api-keys" '{"name":"Test API Key","scopes":["read","write"],"expires_in_days":30}')
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)

if is_success "$status"; then
    print_pass "API key created"
    API_KEY_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
    print_info "Created API key ID: $API_KEY_ID"
else
    print_info "API key creation returned status: $status"
fi

if [ -n "$API_KEY_ID" ]; then
    print_test "DELETE /api/v1/workspaces/:id/api-keys/:key_id - Delete API key"
    result=$(auth_request DELETE "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/api-keys/${API_KEY_ID}")
    status=$(echo "$result" | head -1)

    if is_success "$status"; then
        print_pass "API key deleted"
    else
        print_info "API key deletion returned status: $status"
    fi
fi

# =============================================================================
print_header "8. Secret Operations"
# =============================================================================

if [ -n "$SERVER_ID" ]; then
    print_section "Secrets"

    print_test "GET /api/v1/workspaces/:id/servers/:server_id/secrets - List secrets"
    result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/secrets")
    status=$(echo "$result" | head -1)
    body=$(echo "$result" | tail -n +2)

    if is_success "$status"; then
        print_pass "Secrets list retrieved"
    else
        print_info "Secrets list returned status: $status"
    fi

    print_test "POST /api/v1/workspaces/:id/servers/:server_id/secrets - Create secret"
    result=$(auth_request POST "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/secrets" '{"key":"TEST_SECRET_KEY","value":"test_secret_value_123"}')
    status=$(echo "$result" | head -1)

    if is_success "$status"; then
        print_pass "Secret created"
    else
        print_info "Secret creation returned status: $status"
    fi

    print_test "DELETE /api/v1/workspaces/:id/servers/:server_id/secrets/:key - Delete secret"
    result=$(auth_request DELETE "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/secrets/TEST_SECRET_KEY")
    status=$(echo "$result" | head -1)

    if is_success "$status"; then
        print_pass "Secret deleted"
    else
        print_info "Secret deletion returned status: $status"
    fi
else
    print_skip "No server available for secret tests"
fi

# =============================================================================
print_header "9. Log Operations"
# =============================================================================

if [ -n "$SERVER_ID" ]; then
    print_section "Logs and Stats"

    print_test "GET /api/v1/workspaces/:id/servers/:server_id/logs - Get logs"
    result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/logs")
    status=$(echo "$result" | head -1)

    if is_success "$status"; then
        print_pass "Logs retrieved"
    else
        print_info "Logs returned status: $status"
    fi

    print_test "GET /api/v1/workspaces/:id/servers/:server_id/stats - Get stats"
    result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/stats")
    status=$(echo "$result" | head -1)

    if is_success "$status"; then
        print_pass "Stats retrieved"
    else
        print_info "Stats returned status: $status"
    fi
else
    print_skip "No server available for log tests"
fi

# =============================================================================
print_header "10. Webhook Operations"
# =============================================================================

if [ -n "$SERVER_ID" ]; then
    print_section "Webhooks"

    print_test "GET /api/v1/workspaces/:id/servers/:server_id/webhooks - List webhooks"
    result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/webhooks")
    status=$(echo "$result" | head -1)
    body=$(echo "$result" | tail -n +2)

    if is_success "$status"; then
        print_pass "Webhooks list retrieved"
    else
        print_info "Webhooks list returned status: $status"
    fi

    print_test "POST /api/v1/workspaces/:id/servers/:server_id/webhooks - Create webhook"
    result=$(auth_request POST "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/webhooks" '{"name":"Test Webhook","webhook_url":"https://httpbin.org/post","events":["deploy.success","deploy.failure"]}')
    status=$(echo "$result" | head -1)
    body=$(echo "$result" | tail -n +2)

    if is_success "$status"; then
        print_pass "Webhook created"
        WEBHOOK_ID=$(echo "$body" | grep -o '"id":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
        print_info "Created webhook ID: $WEBHOOK_ID"
    else
        print_info "Webhook creation returned status: $status"
    fi

    if [ -n "$WEBHOOK_ID" ]; then
        print_test "PATCH /api/v1/workspaces/:id/servers/:server_id/webhooks/:webhook_id - Update webhook"
        result=$(auth_request PATCH "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/webhooks/${WEBHOOK_ID}" '{"name":"Updated Test Webhook"}')
        status=$(echo "$result" | head -1)

        if is_success "$status"; then
            print_pass "Webhook updated"
        else
            print_info "Webhook update returned status: $status"
        fi

        print_test "DELETE /api/v1/workspaces/:id/servers/:server_id/webhooks/:webhook_id - Delete webhook"
        result=$(auth_request DELETE "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/webhooks/${WEBHOOK_ID}")
        status=$(echo "$result" | head -1)

        if is_success "$status"; then
            print_pass "Webhook deleted"
        else
            print_info "Webhook deletion returned status: $status"
        fi
    fi
else
    print_skip "No server available for webhook tests"
fi

# =============================================================================
print_header "11. Region Operations"
# =============================================================================

if [ -n "$SERVER_ID" ]; then
    print_section "Regions"

    print_test "GET /api/v1/workspaces/:id/servers/:server_id/regions - List regions"
    result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/servers/${SERVER_ID}/regions")
    status=$(echo "$result" | head -1)

    if is_success "$status"; then
        print_pass "Regions list retrieved"
    else
        print_info "Regions list returned status: $status"
    fi
else
    print_skip "No server available for region tests"
fi

# =============================================================================
print_header "12. Billing Operations"
# =============================================================================

print_section "Billing"

print_test "GET /api/v1/workspaces/:id/billing/subscription - Get subscription"
result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/billing/subscription")
status=$(echo "$result" | head -1)
body=$(echo "$result" | tail -n +2)

if is_success "$status"; then
    print_pass "Subscription info retrieved"
    PLAN=$(echo "$body" | grep -o '"plan":"[^"]*"' | head -1 | sed 's/.*:"\([^"]*\)".*/\1/')
    print_info "Current plan: $PLAN"
else
    print_info "Subscription info returned status: $status"
fi

print_test "GET /api/v1/workspaces/:id/billing/invoices - List invoices"
result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/billing/invoices")
status=$(echo "$result" | head -1)

if is_success "$status"; then
    print_pass "Invoices list retrieved"
else
    print_info "Invoices returned status: $status"
fi

print_test "GET /api/v1/workspaces/:id/billing/payment-method - Get payment method"
result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/billing/payment-method")
status=$(echo "$result" | head -1)

if is_success "$status"; then
    print_pass "Payment method retrieved"
else
    print_info "Payment method returned status: $status"
fi

print_test "GET /api/v1/workspaces/:id/billing/settings - Get billing settings"
result=$(auth_request GET "${API_URL}/api/v1/workspaces/${WORKSPACE_ID}/billing/settings")
status=$(echo "$result" | head -1)

if is_success "$status"; then
    print_pass "Billing settings retrieved"
else
    print_info "Billing settings returned status: $status"
fi

# =============================================================================
print_header "13. GitHub Operations"
# =============================================================================

print_section "GitHub"

print_test "GET /api/v1/github/repos - List GitHub repos"
result=$(auth_request GET "${API_URL}/api/v1/github/repos")
status=$(echo "$result" | head -1)

if is_success "$status"; then
    print_pass "GitHub repos list retrieved"
else
    print_info "GitHub repos returned status: $status (may require GitHub token)"
fi

# =============================================================================
print_header "14. User Preferences"
# =============================================================================

print_section "Preferences"

print_test "GET /api/v1/user/preferences - Get preferences"
result=$(auth_request GET "${API_URL}/api/v1/user/preferences")
status=$(echo "$result" | head -1)

if is_success "$status"; then
    print_pass "User preferences retrieved"
else
    print_info "User preferences returned status: $status"
fi

print_test "PATCH /api/v1/user/preferences - Update preferences"
result=$(auth_request PATCH "${API_URL}/api/v1/user/preferences" '{"sidebar_order":["workspaces","servers","deployments"]}')
status=$(echo "$result" | head -1)

if is_success "$status"; then
    print_pass "User preferences updated"
else
    print_info "User preferences update returned status: $status"
fi

# =============================================================================
print_header "15. Notification Settings"
# =============================================================================

print_section "Notifications"

print_test "GET /api/v1/user/notifications - Get notification settings"
result=$(auth_request GET "${API_URL}/api/v1/user/notifications")
status=$(echo "$result" | head -1)

if is_success "$status"; then
    print_pass "Notification settings retrieved"
else
    print_info "Notification settings returned status: $status"
fi

print_test "PATCH /api/v1/user/notifications - Update notification settings"
result=$(auth_request PATCH "${API_URL}/api/v1/user/notifications" '{"email_deploy_success":true,"email_deploy_failure":true}')
status=$(echo "$result" | head -1)

if is_success "$status"; then
    print_pass "Notification settings updated"
else
    print_info "Notification settings update returned status: $status"
fi

# =============================================================================
print_header "16. Profile Operations"
# =============================================================================

print_section "Profile"

print_test "PATCH /api/v1/auth/profile - Update profile"
result=$(auth_request PATCH "${API_URL}/api/v1/auth/profile" "{\"name\":\"$USER_NAME\"}")
status=$(echo "$result" | head -1)

if is_success "$status"; then
    print_pass "Profile updated"
else
    print_info "Profile update returned status: $status"
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
