/* eslint-disable camelcase */
const micromatch = require('micromatch')
const slackifyMarkdown = require('slackify-markdown')
const postMessage = require('./postMessage')
const template = require('./template')
const truncate = require('./truncate')
const getRepoInfo = require('./getRepoInfo')

// 2900 is the limit for a message block of type 'section'.
const MAX_LENGTH = 2900

module.exports = async (pluginConfig, context) => {
  const {
    logger,
    nextRelease,
    options,
    branch,
    env: { SEMANTIC_RELEASE_PACKAGE, npm_package_name }
  } = context
  const {
    slackWebhook = process.env.SLACK_WEBHOOK,
    unsafeMaxLength = MAX_LENGTH,
    packageName,
    filterBranches
  } = pluginConfig

  if (filterBranches && !micromatch.isMatch(branch.name, filterBranches)) {
    logger.log(
      `Branch ${branch.name} does not match filter branches. Doing nothing.`
    )
    return
  }

  const package_name =
    SEMANTIC_RELEASE_PACKAGE || packageName || npm_package_name

  if (!pluginConfig.notifyOnSuccess) {
    logger.log('Notifying on success skipped')
    return
  }

  logger.log('Sending slack notification on success')

  const repo = getRepoInfo(options.repositoryUrl)

  let releaseNotes = nextRelease.notes

  if (pluginConfig.markdownReleaseNotes) {
    // Creating slack format from the markdown notes.
    releaseNotes = slackifyMarkdown(releaseNotes)
  }

  // truncate long messages
  releaseNotes = truncate(releaseNotes, unsafeMaxLength)

  let slackMessage = {}
  // Override default success message
  if (pluginConfig.onSuccessTemplate) {
    slackMessage = template(pluginConfig.onSuccessTemplate, {
      package_name,
      npm_package_version: nextRelease.version,
      repo_path: repo.path,
      repo_url: repo.URL,
      release_notes: releaseNotes
    })
  } else {
    let messageBlocks = [
      {
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `A new version of \`${package_name}\` has been released!\nCurrent version is *#${
            nextRelease.version
          }*`
        }
      }
    ]

    if (releaseNotes !== '') {
      messageBlocks.push({
        type: 'section',
        text: {
          type: 'mrkdwn',
          text: `${releaseNotes}`
        }
      })
    }

    slackMessage = {
      blocks: messageBlocks,
      text: `A new version of ${package_name} has been released!`
    }

    if (repo.path) {
      const gitTag = nextRelease.gitTag

      slackMessage.attachments = [
        {
          color: '#2cbe4e',
          blocks: [
            {
              type: 'context',
              elements: [
                {
                  type: 'mrkdwn',
                  text: `:package: *<${repo.URL}|${repo.path}>:*   <${
                    repo.URL
                  }/releases/tag/${gitTag}|${gitTag}>`
                }
              ]
            }
          ]
        }
      ]
    }
  }

  logger.log(slackMessage)

  await postMessage(slackMessage, logger, slackWebhook)
}
