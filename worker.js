addEventListener("fetch", (event) => {
  event.respondWith(
    new Response("This API does not implement direct access", { status: 400 })
  );
});

addEventListener("scheduled", (event) => {
  event.waitUntil(handleRequest(event));
});

/**
 * Respond to the request
 * @param {Request} request
 */
async function handleRequest() {
  const githubApiToken = await releaseDb.get("token");
  const githubApiEndpoint =
    "https://api.github.com/repos/microsoft/vscode/releases?per_page=1";
  const githubApiResponse = await fetch(githubApiEndpoint, {
    headers: {
      authorization: githubApiToken ? `token ${githubApiToken}` : undefined,
      "User-Agent": "VS Code Releases Checker",
    },
  });

  if (!githubApiResponse.ok) {
    return new Response(
      `GitHub API responded with HTTP ${githubApiResponse.status}`,
      {
        status: 500,
      }
    );
  }

  const githubApiData = await githubApiResponse.json();

  const { tag_name, id } = githubApiData[0];
  const seenThisRelease = !!(await releaseDb.get(id));

  if (!seenThisRelease) {
    await releaseDb.put(id, tag_name);
    console.log(`Took note of ${tag_name} (${id})`);
    // Trigger GitHub Action
    const workflowTrigger = await fetch(
      "https://api.github.com/repos/filiptronicek/slack-vscode-release/dispatches",
      {
        method: "post",
        body: JSON.stringify(githubApiData),
        headers: {
          "Content-Type": "application/json",
          Authorization: `token ${githubApiToken}`,
          "User-Agent": "VS Code Releases Checker",
        },
      }
    );
    console.log(
      `GitHub Action trigger: HTTP ${
        workflowTrigger.status
      } - ${await workflowTrigger.text()}`
    );
    if (!workflowTrigger.ok) {
      await releaseDb.delete(id);
    }
  } else {
    console.log(`Already seen ${tag_name} (${id})`);
  }

  return new Response(seenThisRelease.toString(), {
    status: 200,
  });
}
