import "react-native-url-polyfill/auto";
import "./src/tracking"; // Register background task before rendering any component.
import { registerRootComponent } from "expo";
import App from "./App";
registerRootComponent(App);
