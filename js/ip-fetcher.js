// Records the client's public IP address -- used for basic
// fraud/abuse visibility on rentals, nothing more. Best-effort.

export async function fetchClientIp() {
  try {
    const response = await fetch("https://api.ipify.org?format=json");

    if (!response.ok) {
      throw new Error("Failed to fetch IP address");
    }

    const data = await response.json();
    return data.ip || null;
  } catch (error) {
    console.error("Error fetching client IP:", error);
    return null;
  }
}

export async function saveUserIpAddress(uid) {
  if (!uid) return;
  try {
    const ipAddress = await fetchClientIp();
    if (ipAddress) {
      console.log("Client IP address:", ipAddress);
    }
  } catch (error) {
    // Quiet fallback
  }
}
