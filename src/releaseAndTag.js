'use strict';

if (!process.env.SSH_PRIVATE_KEY) {
  throw new Error('Error: Specify SSH_PRIVATE_KEY in environment');
}
const SSH_PRIVATE_KEY = process.env.SSH_PRIVATE_KEY;

if (!process.env.SSH_PUBLIC_KEY) {
  throw new Error('Error: Specify SSH_PUBLIC_KEY in environment');
}
const SSH_PUBLIC_KEY = process.env.SSH_PUBLIC_KEY;

if (!process.env.SSH_KEY_PASSPHRASE) {
  throw new Error('Error: Specify SSH_KEY_PASSPHRASE in environment');
}

const SSH_KEY_PASSPHRASE = process.env.SSH_KEY_PASSPHRASE;

if (!process.env.VALID_RELEASE_USERS) {
  throw new Error('Error: Specify comma separated list of VALID_RELEASE_USERS in environment');
}

const VALID_RELEASE_USERS = process.env.VALID_RELEASE_USERS;
const releaseProject = 'release-project';
const releaseType = 'release-type';
const releaseFinal = 'release-final';

const uniqueid = require('uniqueid');
const getUniqueId = uniqueid(process.pid);
const fs = require('mz/fs');
const Git = require('nodegit');
const Github = require('../lib/github');
const randomDogBreed = require('dog-breed-names').random;
const rmdir = require('rimraf');
const mkdirp = require('mkdirp');
const moment = require('moment');
const uniqueReleaseName = require('../lib/uniqueReleaseName');
const { generateReleaseNotes } = require('generate-github-release-notes');
const incrementPackageVersion = require('../lib/incrementPackageVersion');
const { releaseList } = require('../lib/releaseList');

const cloneRepository = async (owner, repo, target) => {
  const url = `git@github.com:${owner}/${repo}`;
  console.log(`Cloning ${url} into ${target}`);
  const opts = {
    fetchOpts: {
      callbacks: {
        credentials: async (url, userName) => {
          return await Git.Cred.sshKeyMemoryNew(
            userName,
            SSH_PUBLIC_KEY,
            SSH_PRIVATE_KEY,
            SSH_KEY_PASSPHRASE
          );
        }
      }
    }
  };

  return await Git.Clone(url, target, opts);
};

const commitAndTag = async (dir, name, releaseName) => {
  const message = `${name} ${releaseName}`;
  console.log(`Commit and tag ${message} in ${dir}`);

  // From the examples at https://github.com/nodegit/nodegit/blob/master/examples/
  const repository = await Git.Repository.open(dir);
  const index = await repository.refreshIndex();
  await index.addAll();
  await index.write();
  const oid = await index.writeTree();
  const HEAD = await Git.Reference.nameToId(repository, 'HEAD');
  const parent = await repository.getCommit(HEAD);

  const now = moment().utc().unix();
  const author = Git.Signature.create('Zorgbort', 'info@iliosproject.org', now, 0);
  const commit = await repository.createCommit('HEAD', author, author, message, oid, [parent]);

  console.log(`Create tag ${name} "${message}"`);
  await repository.createTag(commit, name, message);
  const opts = {
    callbacks: {
      credentials: async (url, userName) => {
        return await Git.Cred.sshKeyMemoryNew(
          userName,
          SSH_PUBLIC_KEY,
          SSH_PRIVATE_KEY,
          SSH_KEY_PASSPHRASE
        );
      }
    }
  };
  const remote = await Git.Remote.lookup(repository, 'origin');
  console.log('Pushing new tag to origin');
  return await remote.push([
    'refs/heads/master:refs/heads/master',
    `refs/tags/${name}:refs/tags/${name}`,
  ], opts);
};

const createTempDirectory = async (name) => {
  console.log(`Creating temporary directory for ${name}`);
  const appRoot = require('app-root-path');
  const dir = `${appRoot}/tmp/${name}/` + getUniqueId();
  const exists = await fs.exists(dir);
  if (exists) {
    throw new Error(`Tried to create directory, but it already exists: ${dir}`);
  }
  mkdirp(dir);
  console.log(`${dir} created`);

  return dir;
};

const removeTempDirectory = async (name) => {
  const dir = `/tmp/${name}/` + getUniqueId();
  console.log(`Removing temporary directory ${dir}`);

  return await rmdir(dir, err => {
    console.error(err);
  });
};

const releaseAndTag = async (owner, repo, releaseType, namer) => {
  console.log(`Release and tag ${owner}/${repo} as ${releaseType}`);
  const dir = await createTempDirectory(repo);
  await cloneRepository(owner, repo, dir);

  const { nextVersion, currentVersion } = await incrementPackageVersion(dir, releaseType);
  const version = `v${nextVersion}`;
  console.log(`${nextVersion} will be called ${version}`);
  const releaseName = await uniqueReleaseName(nextVersion, releaseList, namer, owner, repo);
  const releaseNotes = await generateReleaseNotes(Github, owner, repo, `v${currentVersion}`, version);
  await commitAndTag(dir, version, releaseName);
  await removeTempDirectory(repo);
  console.log(`Creating release for ${owner}/${repo} at ${version} as ${releaseName}`);

  const release = await Github.repos.createRelease({
    owner,
    repo,
    tag_name: version,
    name: releaseName,
    body: releaseNotes,
    draft: false,
    prerelease: false,
  });

  return {
    version,
    releaseName,
    releaseUrl: release.data.html_url
  };
};

const validateRequestAndRelease = async (bot, message, owner, repo, releaseType, namer) => {
  const user = message.user;

  const validUsers = VALID_RELEASE_USERS.split(',');
  if (validUsers.includes(user)) {
    try {
      return await releaseAndTag(owner, repo, releaseType, namer);
    } catch (e) {
      await bot.reply(message, `Error: ${e.message} (stack trace in logs)`);
      console.error(e);
    }
  } else {
    try {
      const resp = await bot.api.users.info({ user });
      let bestName = 'Dave';
      if (resp.ok) {
        if (resp.user.profile.first_name) {
          bestName = resp.user.profile.first_name;
        } else {
          bestName = resp.user.name;
        }
      }
      await bot.reply(message, `:no_entry: I'm Sorry, ${bestName}, I'm afraid Zorgbort can't do that.`);
    } catch (e) {
      await bot.reply(message, `Error: ${e.message} (stack trace in logs)`);
      console.error(e);
    }
  }
};

const createActionReply = (text, callback_id, actions) => {
  return {
    text: "Let's release some code!",
    attachments: [
      {
        text,
        callback_id,
        attachment_type: 'default',
        color: '#84c444',
        actions
      }
    ]
  };
};

const getPersonFromMessage = (message) => {
  let person = '<@' + message.user + '>';
  if (message.channel[0] == 'D') {
    person = 'You';
  }

  return person;
};

const startRelease = async (bot, message) => {
  await bot.reply(message, createActionReply(':cool: I just need to know:', releaseProject, [
    {
      name: 'project',
      text: 'Which Project?',
      type: 'select',
      options: [
        {
          text: 'Ilios Frontend',
          value: 'frontend',
        },
        {
          text: 'Ilios Common Addon',
          value: 'common',
        },
        {
          text: 'Ilios LTI Server',
          value: 'lti-server',
        },
        {
          text: 'Ilios LTI Dashboard',
          value: 'lti-dashboard',
        },
        {
          text: 'Ember Simple Charts',
          value: 'ember-simple-charts',
        },
      ]
    },
    {
      name: 'cancel',
      text: 'Cancel',
      value: 'cancel',
      type: 'button',
      style: 'danger',
    },
  ]));
};

const chooseReleaseType = async (bot, message) => {
  if (message.callback_id === releaseProject) {
    if (message.actions[0].value === 'cancel') {
      const cancelRelease = createActionReply('Done! Your release has been canceled', false, []);
      await bot.replyInteractive(message, cancelRelease);
    } else {
      const selection = message.actions[0].selected_options[0].value;
      const person = getPersonFromMessage(message);
      const reply = createActionReply('What kind of change is this?', releaseType, [
        {
          name: 'major',
          text: 'Breaking / API Bump',
          value: selection + '$$major',
          type: 'button',
          style: 'danger',
        },
        {
          name: 'minor',
          text: 'Feature',
          value: selection + '$$minor',
          type: 'button',
        },
        {
          name: 'patch',
          text: 'Bugfix',
          value: selection + '$$patch',
          type: 'button',
          style: 'primary',
        },
      ]);
      const text = person + ' chose to release ' + selection;
      reply.attachments.unshift({ text, color: '#84c444' });
      await bot.replyInteractive(message, reply);
    }
  }
};

const confirmRelease = async (bot, message) => {
  if (message.callback_id === releaseType) {
    const [selection, npmType] = message.actions[0].value.split('$$');
    const text = `
      I'm going to release a ${npmType} version of ${selection}.
      Is that correct?`;
    const reply = createActionReply(text, releaseFinal, [
      {
        name: 'yes',
        text: 'Yes. Make it So!',
        value: selection + '$$' + npmType,
        type: 'button',
        style: 'primary',
      },
      {
        name: 'no',
        text: 'No. Belay that Order!',
        value: 'cancel',
        type: 'button',
        style: 'danger',
      },
    ]);
    await bot.replyInteractive(message, reply);
  }
};

const doRelease = async (bot, message) => {
  if (message.callback_id === releaseFinal) {
    if (message.actions[0].value === 'cancel') {
      const cancelRelease = createActionReply('OK Consider it Canceled!', false, []);
      await bot.replyInteractive(message, cancelRelease);
    } else {
      const [selection, npmType] = message.actions[0].value.split('$$');
      const person = getPersonFromMessage(message);
      const text = `${person} chose to release a ${npmType} version of ${selection}`;
      const reply = createActionReply(text, false, []);
      reply.attachments.push({
        text: ":robot_face: Ok, I'm building your release now...",
        color: '#ffc339',
      });
      await bot.replyInteractive(message, reply);
      const owner = 'ilios';
      let namer = version => `${version}`;
      switch (selection) {
      case 'frontend':
        namer = randomDogBreed;
        break;
      case 'common':
        namer = version => `Ilios Common ${version}`;
        break;
      case 'lti-server':
        namer = version => `LTI Server ${version}`;
        break;
      case 'lti-dashboard':
        namer = version => `LTI Dashboard ${version}`;
        break;
      }
      const result = await validateRequestAndRelease(bot, message, owner, selection, npmType, namer);

      const finishedReply = createActionReply(text, false, []);
      finishedReply.attachments.push({
        text: `:rocket: ${owner}:${selection} ${result.releaseName} has been released. :tada:`,
        color: '#84c444',
      });
      finishedReply.attachments.push({
        text: `Release notes at ${result.releaseUrl}`,
        color: '#84c444',
      });
      await bot.replyInteractive(message, finishedReply);
    }
  }
};

module.exports = bot => {
  bot.hears(['start release', 'release'], ['direct_message', 'direct_mention', 'mention'], startRelease);
  bot.on('interactive_message', chooseReleaseType);
  bot.on('interactive_message', confirmRelease);
  bot.on('interactive_message', doRelease);
};
