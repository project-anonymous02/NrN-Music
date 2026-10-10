package com.nrnmusic.app;

import android.util.Log;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.net.DatagramPacket;
import java.net.DatagramSocket;
import java.net.Inet4Address;
import java.net.InetAddress;
import java.net.InetSocketAddress;
import java.net.NetworkInterface;
import java.util.ArrayList;
import java.util.Enumeration;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import org.json.JSONObject;

/**
 * Listens for the backend's UDP discovery beacon (JSON with an "app" field set
 * to "nrnmusic") and resolves with every unique sender seen within the timeout.
 */
@CapacitorPlugin(name = "LanDiscovery")
public class LanDiscoveryPlugin extends Plugin {
    private static final String TAG = "LanDiscovery";
    private static final String MAGIC = "nrnmusic";
    private static final int DEFAULT_PORT = 47855;

    @PluginMethod
    public void scan(PluginCall call) {
        Integer timeout = call.getInt("timeoutMs", 3000);
        Integer port = call.getInt("port", DEFAULT_PORT);
        new Thread(() -> {
            List<JSObject> found = listen(port, timeout);
            JSArray arr = new JSArray();
            for (JSObject item : found) {
                arr.put(item);
            }
            JSObject result = new JSObject();
            result.put("beacons", arr);
            call.resolve(result);
        }, "nrn-discovery").start();
    }

    /** Local (Wi-Fi) IPv4 of this device — used to bound the fallback subnet scan. */
    @PluginMethod
    public void localIp(PluginCall call) {
        new Thread(() -> {
            JSObject result = new JSObject();
            result.put("ip", findLocalIp());
            call.resolve(result);
        }, "nrn-localip").start();
    }

    private String findLocalIp() {
        try {
            Enumeration<NetworkInterface> interfaces = NetworkInterface.getNetworkInterfaces();
            while (interfaces != null && interfaces.hasMoreElements()) {
                NetworkInterface nif = interfaces.nextElement();
                if (nif.isLoopback() || !nif.isUp()) {
                    continue;
                }
                Enumeration<InetAddress> addresses = nif.getInetAddresses();
                while (addresses.hasMoreElements()) {
                    InetAddress address = addresses.nextElement();
                    if (address instanceof Inet4Address && !address.isLoopbackAddress()) {
                        return address.getHostAddress();
                    }
                }
            }
        } catch (Exception error) {
            Log.e(TAG, "localIp failed", error);
        }
        return null;
    }

    private List<JSObject> listen(int port, int timeoutMs) {
        List<JSObject> found = new ArrayList<>();
        Set<String> seen = new HashSet<>();
        long deadline = System.currentTimeMillis() + timeoutMs;
        byte[] buffer = new byte[1024];

        try (DatagramSocket socket = new DatagramSocket(null)) {
            socket.setReuseAddress(true);
            socket.bind(new InetSocketAddress(port));
            socket.setSoTimeout(500);
            Log.i(TAG, "listening on udp/" + port);

            while (System.currentTimeMillis() < deadline) {
                DatagramPacket packet = new DatagramPacket(buffer, buffer.length);
                try {
                    socket.receive(packet);
                } catch (java.net.SocketTimeoutException e) {
                    continue;
                }
                String text = new String(packet.getData(), packet.getOffset(), packet.getLength()).trim();
                if (!text.contains(MAGIC)) {
                    continue;
                }
                String ip = packet.getAddress() != null ? packet.getAddress().getHostAddress() : null;
                if (ip == null || !seen.add(ip)) {
                    continue;
                }
                JSObject item = new JSObject();
                item.put("ip", ip);
                try {
                    JSONObject json = new JSONObject(text);
                    item.put("port", json.optInt("port", 8000));
                    item.put("name", json.optString("name", ""));
                } catch (Exception parseError) {
                    item.put("port", 8000);
                }
                found.add(item);
            }
        } catch (Exception error) {
            Log.e(TAG, "discovery failed", error);
        }

        Log.i(TAG, "found " + found.size() + " backend(s)");
        return found;
    }
}
