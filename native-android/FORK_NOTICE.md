# NrNMusic Android fork notice

The Android application and the `:innertube` module in this directory are derived from Metrolist.

- Upstream project: <https://github.com/MetrolistGroup/Metrolist>
- Upstream revision: `76fa5a78b5110674442884b6f21c0cef51cdb782` (2026-10-11)
- License: GNU GPL version 3.0; see [`LICENSE`](LICENSE).
- Upstream stream library: [InnerTubeX](https://github.com/MetrolistGroup/innertubex), version `v0.8.4`, also GPL-3.0.

NrNMusic changes include the Android application ID and display name, launcher icon resources, release destination text, and the Android build workflow. Upstream source headers and copyright notices are retained. The original React/FastAPI web implementation remains outside this Android module and is not part of the native APK build.

This fork is not affiliated with, endorsed by, or sponsored by YouTube, Google, or the Metrolist maintainers. YouTube and Google may change the undocumented InnerTube protocol, so remote catalog or playback availability is not guaranteed. The Android app does not require a NrNMusic account or NrNMusic backend; some optional upstream account features remain in the app and may require the user's service account.

When distributing the Android APK, provide the corresponding source and GPL-3.0 notices to recipients as required by the license.
