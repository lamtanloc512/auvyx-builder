import { mount } from "svelte";
import App from "./App.svelte";
import { theme } from "./lib/theme.svelte";
import "./app.css";

theme.start();
mount(App, { target: document.getElementById("app")! });
