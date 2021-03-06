# ZORGBORT (an Ilios bot)

Zorgbort is going to make common tasks easier to do.

## Running Locally:

You'll need a publicly accessible address to configure slack oauth.
You can create a tunnel with https://www.npmjs.com/package/localtunnel
and run  `lt --port 8899 -s zorgbort-stage` to connect

You'll need to configure a Slack app to test with at https://api.slack.com/apps
This will give you the details to fill in for your `.env` file.

1. `git clone zorgbort`
2. `npm install`
3. add a `.env` file with:
```bash
BOT_TOKEN="TOKEN"
CLIENT_ID="CLIENTID"
CLIENT_SECRET="SECRET"
CLIENT_SIGNING_SECRET="SIGNING_SECRET"
VERIFICATION_TOKEN="VERIFICATION_TOKEN"
GITHUB_TOKEN="TOKEN"
SSH_KEY_PASSPHRASE="ZORGBORT Passphrase"
SSH_PRIVATE_KEY="ZORGBORT KEYFILE Contents"
SSH_PUBLIC_KEY="ZORGBORT PUBLICKEY Contents"
VALID_RELEASE_USERS="SLACKID,SLACKID2"
PORT=8899
```
4. Run ZORBORT with `npm start`
5. Test ZORBORT with `npm test`

## Heroku Deployment

### Install Heroku CLI

`brew tap heroku/brew && brew install heroku`

### Reading logs / Checking status
`heroku logs -t -a zorgbort`

### Restart
`heroku restart -a zorgbort`

## Deploying to heroku 

You shouldn't need to do this it happens automatically using heroku's github integration.

1. `heroku create`
2. `heroku addons:create mongolab:sandbox`
3. `git push heroku master`
4. `heroku config:set BOT_TOKEN="BOT_TOKEN"`
5. `heroku config:set CLIENT_ID="ID"`
6. `heroku config:set CLIENT_SECRET="SECRET"`
7. `heroku config:set CLIENT_SIGNING_SECRET="SIGNING_SECRET"`
8. `heroku config:set VERIFICATION_TOKEN="VERIFICATION_TOKEN"`
9. `heroku config:set SSH_KEY_PASSPHRASE="ZORGBORT Passphrase"`
10. `heroku config:add SSH_PRIVATE_KEY="$(cat KEYFILE)"`
11. `heroku config:add SSH_PUBLIC_KEY="$(cat PUBLICKEYFILE)"`
12. `heroku config:set VALID_RELEASE_USERS="SLACKID,SLACKID2"`

Go to https://zorgbort.herokuapp.com/login to setup oauth.

## Acknowledgments

* Release Notes idea and format from [github-changelog-generator](https://github.com/skywinder/github-changelog-generator)
