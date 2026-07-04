export interface DirectoryInterface {
  folder: string;
  files: string[];
  children: DirectoryInterface[];
}
export const TestDataDirectories: DirectoryInterface = {
  folder: "source",
  files: ["readme.md", "license.txt", "invalid-file-type.lock"],
  children: [
    {
      folder: "projects",
      files: ["overview.md"],
      children: [
        {
          folder: "app",
          files: ["package.json", "readme.md", "tsconfig.json"],
          children: [
            {
              folder: "src",
              files: ["index.ts", "utils.ts"],
              children: [
                {
                  folder: "components",
                  files: ["Button.tsx", "Panel.tsx"],
                  children: [],
                },
              ],
            },
            {
              folder: "dist",
              files: ["index.js", "index.js.map"],
              children: [],
            },
            {
              folder: "node_modules",
              files: [".package-lock.json"],
              children: [
                { folder: "express", files: ["index.js"], children: [] },
              ],
            },
            { folder: ".git", files: ["HEAD", "config"], children: [] },
            { folder: "empty-subfolder", files: [], children: [] },
          ],
        },
        {
          folder: "docs",
          files: ["guide.md", "api.md"],
          children: [{ folder: "images", files: ["logo.png"], children: [] }],
        },
      ],
    },
    {
      folder: "backups",
      files: ["notes.txt"],
      children: [
        {
          folder: "archive",
          files: ["2024-01.md", "2024-02.md"],
          children: [],
        },
        {
          folder: "pending",
          files: [],
          children: [{ folder: "empty-nested", files: [], children: [] }],
        },
      ],
    },
    { folder: "empty-folder", files: [], children: [] },
  ],
};
