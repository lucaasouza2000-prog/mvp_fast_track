export default {
  expo: {
    name: "FastTrack",
    slug: "fasttrack",
    version: "0.1.0",
    scheme: "fasttrack",
    orientation: "portrait",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    android: {
      package: "br.com.fastariam.fasttrack",
      allowBackup: false,
      blockedPermissions: [
        "android.permission.RECORD_AUDIO",
        "android.permission.READ_EXTERNAL_STORAGE",
        "android.permission.WRITE_EXTERNAL_STORAGE",
      ],
      permissions: [
        "ACCESS_COARSE_LOCATION",
        "ACCESS_FINE_LOCATION",
        "ACCESS_BACKGROUND_LOCATION",
        "FOREGROUND_SERVICE",
        "FOREGROUND_SERVICE_LOCATION",
        "POST_NOTIFICATIONS",
      ],
    },
    ios: {
      bundleIdentifier: "br.com.fastariam.fasttrack",
      infoPlist: { UIBackgroundModes: ["location"] },
    },
    plugins: [
      [
        "expo-camera",
        {
          cameraPermission:
            "Permita que o FastTrack leia os códigos das notas fiscais.",
          recordAudioAndroid: false,
        },
      ],
      [
        "expo-location",
        {
          locationAlwaysAndWhenInUsePermission:
            "A localização acompanha suas entregas somente durante rotas ativas.",
          isAndroidBackgroundLocationEnabled: true,
          isAndroidForegroundServiceEnabled: true,
          isIosBackgroundLocationEnabled: true,
        },
      ],
      ["expo-sqlite", { useSQLCipher: true }],
      "expo-secure-store",
      "expo-status-bar",
      "expo-font",
    ],
  },
};
