const repo = "C:/Users/product/Desktop/KnowledgeBase";
const web = `${repo}/apps/web`;
export default {
  root: web,
  resolve: { alias: Object.fromEntries(["react", "react-dom", "react-router-dom", "vitest", "@testing-library/react"].map(name => [name, `${web}/node_modules/${name}`])) },
  esbuild: { jsx: "automatic" },
  test: {
    environment: "jsdom", setupFiles: [`${web}/src/setupTests.ts`],
    include: ["../../qa/evidence/t008semantic-checker/*.test.tsx"],
    pool: "threads", maxWorkers: 1, minWorkers: 1,
  },
};
