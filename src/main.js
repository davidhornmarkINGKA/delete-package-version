import core from '@actions/core';
import github from '@actions/github';
import { Octokit } from '@octokit/core';

/**
 * Find and verify a specific version of a package
 * @param {import('@octokit/core').Octokit} kit - The Octokit instance for GitHub API requests
 * @param {string} owner - The organization name
 * @param {string} packageName - The name of the package
 * @param {string} packageType - The type of package (e.g., 'npm', 'container', 'maven')
 * @param {string} version - The version to find
 * @returns {Promise<{id: number, name: string} | null>}
 */
async function findPackageVersion(
  kit,
  owner,
  packageName,
  packageType,
  version
) {
  let versions = [];
  try {
    const response = await kit.request(
      'GET /orgs/{org}/packages/{package_type}/{package_name}/versions',
      {
        org: owner,
        package_type: packageType,
        package_name: packageName
      }
    );
    versions = response.data;
  } catch (error) {
    if (error?.status === 404 || error?.response?.status === 404) {
      core.info(
        `Package [${packageName}] not found in organization [${owner}]`
      );
      return null;
    }
    throw error;
  }

  const pkgVersion = versions.find((v) => v.name === version);

  if (!pkgVersion) {
    core.info(`Available versions: ${versions.map((v) => v.name).join(', ')}`);
    core.info(
      `Package [${packageName}] version [${version}] not found in organization [${owner}]`
    );
    return null;
  }

  core.info(
    `Found package [${packageName}] version [${version}] in organization [${owner}]`
  );

  core.info(`Package type: ${packageType}, Version ID: ${pkgVersion.id}`);

  return pkgVersion;
}

/**
 * Delete a specific version of a package
 * @param {import('@octokit/core').Octokit} kit - The Octokit instance for GitHub API requests
 * @param {string} owner - The organization name
 * @param {string} packageName - The name of the package
 * @param {string} packageType - The type of package (e.g., 'npm', 'container', 'maven')
 * @param {number} versionId - The ID of the version to delete
 * @returns {Promise<void>}
 */
async function deleteVersion(kit, owner, packageName, packageType, versionId) {
  await kit.request(
    'DELETE /orgs/{org}/packages/{package_type}/{package_name}/versions/{version_id}',
    {
      org: owner,
      package_type: packageType,
      package_name: packageName,
      version_id: versionId
    }
  );
}

/**
 * Delete a package version from the organization
 * @param {import('@octokit/core').Octokit} kit - The Octokit instance for GitHub API requests
 * @param {string} owner - The organization name
 * @param {string} packageName - The name of the package
 * @param {string} packageType - The type of package (e.g., 'npm', 'container', 'maven')
 * @param {string} version - The version to delete
 * @returns {Promise<boolean>} True when a delete occurred.
 */
async function deletePackageVersion(
  kit,
  owner,
  packageName,
  packageType,
  version
) {
  if (packageName === 'package-for-ci-testing-in-repo') {
    core.info(
      `Skipping deletion of package [${packageName}] version [${version}] in organization [${owner}] as it is used for CI testing`
    );
    return false;
  }

  const pkgVersion = await findPackageVersion(
    kit,
    owner,
    packageName,
    packageType,
    version
  );

  if (!pkgVersion) {
    return false;
  }

  await deleteVersion(kit, owner, packageName, packageType, pkgVersion.id);
  return true;
}

/**
 * @returns {Promise<void>}
 */
export async function run() {
  const auth = core.getInput('token', { required: true });
  const packageName = core.getInput('package', { required: true });
  const packageType = core.getInput('package-type', { required: true });
  const version = core.getInput('version', { required: true });
  const mustEndWith = core.getInput('must-end-with', { required: false });
  const mustStartWith = core.getInput('must-start-with', { required: false });
  const { repo, owner } = github.context.repo;

  if (mustEndWith && !version.endsWith(mustEndWith)) {
    core.info(
      `Skipping deletion of package [${packageName}] version [${version}] in organization [${owner}] as it does not end with [${mustEndWith}]`
    );
    return;
  }

  if (mustStartWith && !version.startsWith(mustStartWith)) {
    core.info(
      `Skipping deletion of package [${packageName}] version [${version}] in organization [${owner}] as it does not start with [${mustStartWith}]`
    );
    return;
  }
  const kit = new Octokit({ auth });

  try {
    core.info(
      `Deleting package version: [${packageName}@${version}] (${packageType}) from [${owner}/${repo}]`
    );

    const didDelete = await deletePackageVersion(
      kit,
      owner,
      packageName,
      packageType,
      version
    );

    if (didDelete) {
      core.info(
        `Deleted package version: [${packageName}@${version}] (${packageType}) from [${owner}/${repo}]`
      );
    } else {
      core.info(
        `Package version already absent: [${packageName}@${version}] (${packageType}) in [${owner}/${repo}]`
      );
    }
  } catch (error) {
    const {
      response: { data }
    } = error;
    const { status, message } = data;

    core.error(
      `Error: Failed to delete package version: [${packageName}@${version}] (${packageType}) from [${owner}/${repo}]`
    );

    core.error(
      `Error: Failed with status: [${status}] and message: [${message}]`
    );

    core.setFailed(data);
  }
}
