/**
 * Resource Monitor Service - Track VM and system resource usage
 *
 * Monitors:
 * - VM memory usage (per VM and total)
 * - VM CPU usage
 * - VM disk space
 * - VM pool health
 * - Alert on resource constraints
 */

const containerService = require('./container-service');
const errorTracker = require('./error-tracking-service');

class ResourceMonitorService {
    constructor() {
        this.monitorInterval = null;
        this.MONITOR_FREQUENCY = 5 * 60 * 1000; // Check every 5 minutes
        this.MEMORY_THRESHOLD = 90; // Alert if >90% memory used
        this.DISK_THRESHOLD = 85; // Alert if >85% disk used
    }

    /**
     * Start monitoring
     */
    start() {
        console.log('📊 [Resource Monitor] Starting resource monitoring...');

        // Monitor immediately
        this.checkResources().catch(e => {
            console.warn(`⚠️ [Resource Monitor] Initial check failed: ${e.message}`);
        });

        // Then every 5 minutes
        this.monitorInterval = setInterval(() => {
            this.checkResources().catch(e => {
                console.warn(`⚠️ [Resource Monitor] Check failed: ${e.message}`);
            });
        }, this.MONITOR_FREQUENCY);
    }

    /**
     * Stop monitoring
     */
    stop() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitorInterval = null;
            console.log('📊 [Resource Monitor] Stopped');
        }
    }

    /**
     * Check all resources
     */
    async checkResources() {
        console.log('📊 [Resource Monitor] Checking resources...');

        try {
            // Get all running VMs
            const machines = await containerService.listMachines();
            const runningMachines = machines.filter(m => m.state === 'started');

            console.log(`   Found ${runningMachines.length} running VMs`);

            // Check each VM
            let totalMemoryUsed = 0;
            let totalMemoryLimit = 0;
            let alertCount = 0;

            for (const machine of runningMachines) {
                try {
                    const resources = await this.checkVMResources(machine);

                    if (resources) {
                        totalMemoryUsed += resources.memoryUsedMb || 0;
                        totalMemoryLimit += resources.memoryLimitMb || 0;

                        // Check for alerts
                        if (resources.memoryPercent > this.MEMORY_THRESHOLD) {
                            this._alertHighMemory(machine, resources);
                            alertCount++;
                        }

                        if (resources.diskPercent > this.DISK_THRESHOLD) {
                            this._alertHighDisk(machine, resources);
                            alertCount++;
                        }
                    }
                } catch (e) {
                    console.warn(`   ⚠️ Failed to check VM ${machine.id}: ${e.message}`);
                }
            }

            // Summary
            const avgMemoryPercent = totalMemoryLimit > 0
                ? Math.round((totalMemoryUsed / totalMemoryLimit) * 100)
                : 0;

            console.log(`   💾 Total Memory: ${totalMemoryUsed}MB / ${totalMemoryLimit}MB (${avgMemoryPercent}%)`);

            if (alertCount > 0) {
                console.warn(`   ⚠️ ${alertCount} resource alerts triggered`);
            } else {
                console.log(`   ✅ All VMs within resource limits`);
            }

        } catch (error) {
            await errorTracker.trackError({
                operation: 'resource_monitoring',
                error,
                severity: 'warning'
            });
        }
    }

    /**
     * Check resources for a specific VM
     * @param {object} machine - Container/machine object
     * @returns {Promise<object>} Resource usage stats
     */
    async checkVMResources(machine) {
        try {
            const agentUrl = machine.agentUrl;

            // Get memory usage
            const memoryCmd = `free -m | awk 'NR==2{printf "USED:%s TOTAL:%s", $3,$2}'`;
            const memoryResult = await containerService.exec(
                agentUrl,
                memoryCmd,
                '/home/coder',
                machine.id,
                5000,
                true
            );

            // Get disk usage
            const diskCmd = `df -h /home/coder | awk 'NR==2{print $5}' | sed 's/%//'`;
            const diskResult = await containerService.exec(
                agentUrl,
                diskCmd,
                '/home/coder',
                machine.id,
                5000,
                true
            );

            // Parse results
            const memoryMatch = memoryResult.stdout?.match(/USED:(\d+) TOTAL:(\d+)/);
            const memoryUsedMb = memoryMatch ? parseInt(memoryMatch[1]) : 0;
            const memoryTotalMb = memoryMatch ? parseInt(memoryMatch[2]) : 0;
            const memoryPercent = memoryTotalMb > 0
                ? Math.round((memoryUsedMb / memoryTotalMb) * 100)
                : 0;

            const diskPercent = diskResult.stdout?.trim()
                ? parseInt(diskResult.stdout.trim())
                : 0;

            return {
                machineId: machine.id,
                machineName: machine.name,
                memoryUsedMb,
                memoryLimitMb: memoryTotalMb,
                memoryPercent,
                diskPercent
            };
        } catch (error) {
            // Silent fail for individual VMs
            return null;
        }
    }

    /**
     * Alert for high memory usage
     */
    _alertHighMemory(machine, resources) {
        console.warn(`⚠️ [Resource Monitor] HIGH MEMORY on ${machine.name}`);
        console.warn(`   Machine ID: ${machine.id}`);
        console.warn(`   Memory: ${resources.memoryUsedMb}MB / ${resources.memoryLimitMb}MB (${resources.memoryPercent}%)`);

        errorTracker.trackError({
            operation: 'resource_monitoring',
            error: new Error(`High memory usage: ${resources.memoryPercent}%`),
            severity: 'warning',
            context: {
                machineId: machine.id,
                machineName: machine.name,
                memoryPercent: resources.memoryPercent,
                memoryUsedMb: resources.memoryUsedMb
            }
        }).catch(() => {});
    }

    /**
     * Alert for high disk usage
     */
    _alertHighDisk(machine, resources) {
        console.warn(`⚠️ [Resource Monitor] HIGH DISK USAGE on ${machine.name}`);
        console.warn(`   Machine ID: ${machine.id}`);
        console.warn(`   Disk: ${resources.diskPercent}% used`);

        errorTracker.trackError({
            operation: 'resource_monitoring',
            error: new Error(`High disk usage: ${resources.diskPercent}%`),
            severity: 'warning',
            context: {
                machineId: machine.id,
                machineName: machine.name,
                diskPercent: resources.diskPercent
            }
        }).catch(() => {});
    }
}

module.exports = new ResourceMonitorService();
