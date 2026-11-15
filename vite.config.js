
import { defineConfig } from "vite";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
    base: "/Music-to-Bit/",
    plugins: [
        VitePWA({
            registerType: "autoUpdate",
            manifest: {
                name: "音楽Bitに変換",
                short_name: "AMC",
                description: "音楽ファイルをmicro:bitで再生できるようにします!",
                theme_color: "#ffffff",
                background_color: "#ffffff",
                display: "standalone",
                start_url: "/Music-to-Bit/",
                icons: [
                    {
                        src: "/Music-to-Bit/icon-192.png",
                        sizes: "192x192",
                        type: "image/png"
                    },
                    {
                        src: "/Music-to-Bit/icon-512.png",
                        sizes: "512x512",
                        type: "image/png"
                    }
                ]
            }
        })
    ]
});
