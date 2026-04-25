# Wget Commands Reference

## One-Time Setup (After Reset)
```javascript
wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/bitburner-update.js bitburner-update.js
```

```javascript
run bitburner-update.js --all
```

## Individual Scripts

### Batch
```javascript
wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/batch/batch-manager.js batch/batch-manager.js

wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/batch/smart-batcher.js batch/smart-batcher.js

wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/batch/prep.js batch/prep.js

wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/batch/prep-grow.js batch/prep-grow.js
```

### Analysis
```javascript
wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/analysis/profit-scan-flex.js analysis/profit-scan-flex.js

wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/analysis/production-monitor.js analysis/production-monitor.js

wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/analysis/money-logger.js analysis/money-logger.js
```
### Utils
```javascript
wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/utils/ram-check.js utils/ram-check.js

wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/utils/wait-check.js utils/wait-check.js

wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/utils/global-kill.js utils/global-kill.js

wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/utils/upgrade-servers.js utils/upgrade-servers.js

wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/utils/rename-pservs.js utils/rename-pservs.js
```

### Stocks
```javascript
wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/stocks/stock-trader-advanced.js stocks/stock-trader-advanced.js

wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/stocks/close-all-stock.js stocks/close-all-stock.js
```
### Deploy
```javascript

wget https://raw.githubusercontent.com/lfwake2wake/bitburner-scripts/main/deploy/replace-pservs-no-copy.js deploy/replace-pservs-no-copy.js
```
## Common Run Commands

### Batch Manager
```javascript
run batch/batch-manager.js phantasy 0.0075 1.25 home --max-ram=1024

run batch/batch-manager.js sigma-cosmetics 0.05 1.25 home --max-ram=6000
```

### Prep

```javascript
run batch/prep.js <target>
run batch/prep.js <target> --max-ram=1024
run batch/prep-grow.js <target>
```

### Stocks

```javascript
run stocks/stock-trader-advanced.js 10 5000000000 0.15 0.10 6000

run stocks/close-all-stock.js
```

### Utils

```javascript
run utils/ram-check.js
run utils/wait-check.js <target> [seconds]
run utils/global-kill.js
run utils/global-kill.js --keep-stocks
run utils/upgrade-servers.js <targetRam>
run utils/upgrade-servers.js <targetRam> --confirm
```

### Analysis
```javascript
run analysis/profit-scan-flex.js
run analysis/production-monitor.js 60
run analysis/money-logger.js <target> [intervalSeconds] [durationMinutes]
```