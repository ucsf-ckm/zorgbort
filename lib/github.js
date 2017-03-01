if (!process.env.GITHUB_TOKEN) {
  throw new Error('Error: Specify GITHUB_TOKEN in environment');
}

const GitHubApi = require("github");

let github = new GitHubApi({
  debug: true,
  protocol: "https",
  pathPrefix: '',
  headers: {
    "user-agent": "zorgbort ilios bot"
  },
  timeout: 5000
});

github.authenticate({
  type: "token",
  token: process.env.GITHUB_TOKEN,
});

module.exports = github;