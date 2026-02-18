#!/bin/bash
# Deploy SkillVista Backend to Render

set -e

echo "🚀 SkillVista Backend Deployment Script"
echo "========================================"

# Step 1: Check if Procfile exists
if [ -f "Procfile" ]; then
    echo "✅ Procfile exists"
    echo "Content:"
    cat Procfile
else
    echo "❌ Procfile not found!"
    exit 1
fi

# Step 2: Check if render.yaml exists
if [ -f "render.yaml" ]; then
    echo "✅ render.yaml exists"
else
    echo "⚠️  render.yaml not found (optional but recommended)"
fi

# Step 3: Check server.js
if [ -f "server.js" ]; then
    echo "✅ server.js exists"
    # Check if it has the required routes
    if grep -q "app.post.*auth/register" server.js; then
        echo "   ✅ Registration route found"
    fi
    if grep -q "app.post.*auth/login" server.js; then
        echo "   ✅ Login route found"
    fi
else
    echo "❌ server.js not found!"
    exit 1
fi

# Step 4: Check package.json has backend dependencies
echo "Checking backend dependencies..."
for dep in express cors helmet morgan jsonwebtoken bcryptjs; do
    if grep -q "\"$dep\"" package.json; then
        echo "   ✅ $dep installed"
    else
        echo "   ❌ $dep not found in package.json"
    fi
done

# Step 5: Git status
echo ""
echo "📦 Git Status:"
git status --short

# Step 6: Check remote
echo ""
echo "🔗 Remote URL:"
git remote -v

echo ""
echo "✅ All deployment files are in place!"
echo ""
echo "Next steps:"
echo "1. Commit changes: git add .; git commit -m 'Deploy backend to Render'"
echo "2. Push to GitHub: git push origin main --force-with-lease"
echo "3. Render will automatically deploy within 2-3 minutes"
echo "4. Check deployment: https://dashboard.render.com"
