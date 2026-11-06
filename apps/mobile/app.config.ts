export default {
  expo: {
    name: "FAST TRACK",
    slug: "mvpfasttrack",
    owner: "lucas_souza_gm",
    version: "0.1.4",
    extra: {
      eas: { projectId: "4ef6f5b5-dce9-4a36-8a1a-761f876d8b86" },
    },
    scheme: "fasttrack",
    orientation: "portrait",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    android: {
      package: "br.com.fastariam.fasttrack",
      versionCode: 5,
      icon: "./assets/fast-track-logo.png",
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
