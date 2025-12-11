#!/bin/bash

# Script to populate missing regional bestseller data
# Run this to backfill missing weeks and test the edge function

# Colors for output
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
NC='\033[0m' # No Color

echo -e "${GREEN}Regional Bestseller Data Population Script${NC}"
echo "==========================================="

# Check for .env file
if [ ! -f .env ]; then
    echo -e "${RED}Error: .env file not found${NC}"
    echo "Please ensure you have a .env file with VITE_SUPABASE_ANON_KEY"
    exit 1
fi

# Extract the anon key from .env (handle both quoted and unquoted values)
ANON_KEY=$(grep VITE_SUPABASE_ANON_KEY .env | cut -d '=' -f2- | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//' | tr -d '\r\n')
PROJECT_URL=$(grep VITE_SUPABASE_URL .env | cut -d '=' -f2- | sed -e "s/^'//" -e "s/'$//" -e 's/^"//' -e 's/"$//' | tr -d '\r\n')

if [ -z "$ANON_KEY" ]; then
    echo -e "${RED}Error: VITE_SUPABASE_ANON_KEY not found in .env${NC}"
    exit 1
fi

echo -e "${YELLOW}Using project: $PROJECT_URL${NC}"
echo ""

# Function to call the edge function
populate_weeks() {
    local weeks=$1
    local dry_run=${2:-false}

    echo -e "${YELLOW}Populating $weeks week(s) of regional data (dry_run: $dry_run)...${NC}"

    response=$(curl -s -X POST "$PROJECT_URL/functions/v1/populate-regional-bestsellers" \
        -H "Authorization: Bearer $ANON_KEY" \
        -H "Content-Type: application/json" \
        -d "{\"weeks\": $weeks, \"dryRun\": $dry_run}")

    if echo "$response" | grep -q "error"; then
        echo -e "${RED}Error: $response${NC}"
        return 1
    else
        echo -e "${GREEN}Success!${NC}"
        echo "$response" | python3 -m json.tool 2>/dev/null || echo "$response"
        return 0
    fi
}

# Main execution
echo "This script will populate missing regional bestseller data."
echo ""
echo "Options:"
echo "1. Test mode - Dry run for 1 week (no data saved)"
echo "2. Populate last 4 weeks (recommended)"
echo "3. Populate last 8 weeks"
echo "4. Custom number of weeks"
echo ""

read -p "Select option (1-4): " option

case $option in
    1)
        echo -e "\n${YELLOW}Running test (dry run)...${NC}"
        populate_weeks 1 true
        ;;
    2)
        echo -e "\n${YELLOW}Populating last 4 weeks...${NC}"
        populate_weeks 4 false
        ;;
    3)
        echo -e "\n${YELLOW}Populating last 8 weeks...${NC}"
        populate_weeks 8 false
        ;;
    4)
        read -p "Enter number of weeks to populate (1-52): " weeks
        if [[ $weeks -ge 1 && $weeks -le 52 ]]; then
            echo -e "\n${YELLOW}Populating last $weeks weeks...${NC}"
            populate_weeks $weeks false
        else
            echo -e "${RED}Invalid number of weeks. Must be between 1 and 52.${NC}"
            exit 1
        fi
        ;;
    *)
        echo -e "${RED}Invalid option${NC}"
        exit 1
        ;;
esac

echo ""
echo -e "${GREEN}Done!${NC}"
echo ""
echo "Next steps:"
echo "1. Check the Better Bestsellers site to verify regional data is showing"
echo "2. Deploy the cron job to keep data updated weekly"