/**
 * Network Utilities
 * Auto-detect local network IP address
 */

const os = require('os');

/**
 * Get the local network IP address
 * Prefers WiFi interfaces, falls back to Ethernet
 * @returns {string} Local IP address or 'localhost' if not found
 */
function getLocalNetworkIP() {
  const interfaces = os.networkInterfaces();

  // Priority order: WiFi > Ethernet > Other
  const interfaceNames = Object.keys(interfaces);

  // Try WiFi first (most common for mobile development)
  const wifiInterfaces = interfaceNames.filter(name =>
    name.toLowerCase().includes('wi-fi') ||
    name.toLowerCase().includes('wifi') ||
    name.toLowerCase().includes('wlan')
  );

  for (const name of wifiInterfaces) {
    const ip = getIPv4FromInterface(interfaces[name]);
    if (ip) return ip;
  }

  // Try Ethernet
  const ethernetInterfaces = interfaceNames.filter(name =>
    name.toLowerCase().includes('ethernet') ||
    name.toLowerCase().includes('eth')
  );

  for (const name of ethernetInterfaces) {
    const ip = getIPv4FromInterface(interfaces[name]);
    if (ip) return ip;
  }

  // Try any other interface
  for (const name of interfaceNames) {
    const ip = getIPv4FromInterface(interfaces[name]);
    if (ip) return ip;
  }

  return 'localhost';
}

/**
 * Get IPv4 address from network interface
 * @param {Array} interfaceInfo - Network interface info
 * @returns {string|null} IPv4 address or null
 */
function getIPv4FromInterface(interfaceInfo) {
  if (!interfaceInfo) return null;

  for (const iface of interfaceInfo) {
    // Skip internal (loopback) and non-IPv4 addresses
    if (iface.family === 'IPv4' && !iface.internal) {
      return iface.address;
    }
  }

  return null;
}

/**
 * Get all available network IPs
 * Useful for debugging
 * @returns {Array<{name: string, ip: string}>}
 */
function getAllNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const ips = [];

  for (const [name, interfaceInfo] of Object.entries(interfaces)) {
    const ip = getIPv4FromInterface(interfaceInfo);
    if (ip) {
      ips.push({ name, ip });
    }
  }

  return ips;
}

module.exports = {
  getLocalNetworkIP,
  getAllNetworkIPs
};
