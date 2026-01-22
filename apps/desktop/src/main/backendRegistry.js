export const BACKENDS = {
  cutout: {
    name: "cutout",
    host: process.env.UFM_HOST || "127.0.0.1",
    port: Number(process.env.UFM_PORT || 17890),
    health: "/health",
  },
};
