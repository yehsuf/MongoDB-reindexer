# Cluster Testing: Getting Started Index

## Start Here! 👇

Pick your path based on what you need:

---

## 🚀 I Want to Get Started Now (5 minutes)
→ **Read**: [`CLUSTER_TESTING_QUICKSTART.md`](CLUSTER_TESTING_QUICKSTART.md)
- Docker setup
- Quick verification
- First test run

---

## 📚 I Want Full Details (30 minutes)
→ **Read in order**:
1. [`CLUSTER_TESTING_QUICKSTART.md`](./CLUSTER_TESTING_QUICKSTART.md) - **Start Here**
2. [`CLUSTER_TESTING_GUIDE.md`](./CLUSTER_TESTING_GUIDE.md) - Complete guide
3. [`QA_CLUSTER_TESTING_REFERENCE.md`](./QA_CLUSTER_TESTING_REFERENCE.md) - Reference

---

## 🧪 I'm the QA Agent (Running Tests)
→ **Read**: [`QA_CLUSTER_TESTING_REFERENCE.md`](QA_CLUSTER_TESTING_REFERENCE.md)
- When to run tests
- Which command to use
- How to log results
- Troubleshooting

---

## 👨‍💼 I'm the Manager (Delegating Tests)
→ **Read**: [`SOLUTION_SUMMARY.md`](SOLUTION_SUMMARY.md)
- What was implemented
- When to have QA run tests
- Integration with workflows
- Quick reference for commands

---

## 📋 I Want the Complete File List
→ **Read**: [`CLUSTER_TESTING_MANIFEST.md`](CLUSTER_TESTING_MANIFEST.md)
- All files created/updated
- File structure and organization
- Integration points
- Configuration details

---

## ❓ Quick Questions

### "How do I run tests?"
```bash
# Setup (once)
export MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017"

# Run tests
./scripts/run-cluster-tests.sh "$MONGODB_TEST_URI" "reindex_test"  # Both modes
./scripts/test-cli-mode.sh "$MONGODB_TEST_URI" "reindex_test"      # CLI only
```

### "Where are results saved?"
```
.agent_memory/test_results_{YYYYMMDD_HHMMSS}.md
```

### "Which script for what?"
- **`scripts/run-cluster-tests.sh`** - Both CLI + NPM modes (recommended for complex changes)
- **`scripts/test-cli-mode.sh`** - CLI direct testing only
- **`scripts/qa-cluster-test.sh`** - QA test wrapper
- **`scripts/qa-cluster-validation.sh`** - Cluster validation
- **`scripts/test-with-env.sh`** - Environment setup + test

### "When do I need cluster tests?"
- Index rebuilding changes → YES
- Collection handling → YES
- Simple logic changes → NO
- Documentation → NO

### "How do I integrate into workflow?"
- Edit `DEV_FLOW.md` Step 8 (Run Tests)
- For MongoDB ops: Have QA agent run `./scripts/run-cluster-tests.sh`
- For quick validation: Run npm test (local unit tests only)

---

## 📖 Documentation Files (In This Order)

1. **[CLUSTER_TESTING_QUICKSTART.md](CLUSTER_TESTING_QUICKSTART.md)**
   - Quick setup (5 min)
   - Docker or local MongoDB
   - Verification steps

2. **[CLUSTER_TESTING_GUIDE.md](CLUSTER_TESTING_GUIDE.md)**
   - Complete reference
   - All test scenarios
   - Troubleshooting

3. **[CLUSTER_TESTING_IMPLEMENTATION.md](CLUSTER_TESTING_IMPLEMENTATION.md)**
   - What was built
   - How it integrates
   - Best practices

4. **[QA_CLUSTER_TESTING_REFERENCE.md](QA_CLUSTER_TESTING_REFERENCE.md)**
   - QA agent quick ref
   - Test commands
   - Logging format

5. **[SOLUTION_SUMMARY.md](SOLUTION_SUMMARY.md)**
   - Overview of solution
   - Quick start recap
   - File locations

6. **[CLUSTER_TESTING_MANIFEST.md](CLUSTER_TESTING_MANIFEST.md)**
   - Complete file list
   - Structure details
   - Configuration reference

---

## 🛠️ Test Scripts (Ready to Use)

```bash
# Make executable (one time)
chmod +x scripts/run-cluster-tests.sh scripts/test-cli-mode.sh

# Run both modes (recommended)
./scripts/run-cluster-tests.sh "mongodb://testuser:testpass@localhost:27017" "reindex_test"

# Run CLI only
./scripts/test-cli-mode.sh "mongodb://testuser:testpass@localhost:27017" "reindex_test"

# Run NPM only
MONGODB_TEST_URI="mongodb://testuser:testpass@localhost:27017" npm test
```

---

## 🔄 Integration Checklist

- [ ] Read appropriate guide for your role (above)
- [ ] Setup test MongoDB (Docker recommended, 5 min)
- [ ] Build project: `npm run build`
- [ ] Make scripts executable: `chmod +x scripts/run-cluster-tests.sh scripts/test-cli-mode.sh`
- [ ] Run first test: `./scripts/run-cluster-tests.sh "$MONGODB_TEST_URI" "reindex_test"`
- [ ] Check logs: `.agent_memory/test_results_*.md`
- [ ] Integrate into DEV_FLOW.md Step 8 (if needed)
- [ ] Train QA agent on procedures (if needed)

---

## 📁 File Organization

```
.
├── scripts/
│   ├── run-cluster-tests.sh                   ← Master test runner
│   ├── test-cli-mode.sh                       ← CLI mode tests
│   ├── qa-cluster-test.sh                     ← QA wrapper
│   ├── qa-cluster-validation.sh               ← Validation script
│   └── test-with-env.sh                       ← Environment helper
├── docs/cluster-testing/
│   ├── CLUSTER_TESTING_INDEX.md           ← This file
│   ├── CLUSTER_TESTING_GUIDE.md           ← Complete guide
│   ├── LIVE_TESTING_GUIDE.md
│   ├── CLUSTER_TESTING_QUICKSTART.md      ← START HERE
│   ├── CLUSTER_TESTING_IMPLEMENTATION.md
│   ├── QA_CLUSTER_TESTING_REFERENCE.md
│   ├── SOLUTION_SUMMARY.md
│   ├── CLUSTER_TESTING_MANIFEST.md
│   └── CLUSTER_TESTING_INDEX.md           (this file)
│
└── .github/agents/
    └── qa-lead.agent.md                   (updated)
```

---

## 🎯 Your Next Action

**Pick one and start:**

- 🚀 **Quick start?** → [`CLUSTER_TESTING_QUICKSTART.md`](CLUSTER_TESTING_QUICKSTART.md)
- 📚 **Learn everything?** → [`CLUSTER_TESTING_GUIDE.md`](CLUSTER_TESTING_GUIDE.md)
- 👨‍💼 **Manage tests?** → [`SOLUTION_SUMMARY.md`](SOLUTION_SUMMARY.md)
- 🧪 **Run tests?** → [`QA_CLUSTER_TESTING_REFERENCE.md`](QA_CLUSTER_TESTING_REFERENCE.md)

---

## 💡 Key Takeaways

✅ **Both modes work**: CLI direct + NPM tests  
✅ **Real cluster**: Tests against actual MongoDB  
✅ **Automated**: Single command runs everything  
✅ **Results saved**: Timestamped files in `.agent_memory/`  
✅ **Agent ready**: QA agent instructions updated  
✅ **Workflow ready**: Integrates with DEV_FLOW.md  
✅ **Well documented**: Multiple guides for different needs  

---

**Ready? Pick a guide above and let's go!** 🎉
