[33mcommit c32bc61c60fc34f113018879b52d42cae842b301[m[33m ([m[1;36mHEAD -> [m[1;32mnat/deployments[m[33m, [m[1;31morigin/nat/deployments[m[33m)[m
Author: nturinski <naturins@microsoft.com>
Date:   Fri Nov 30 15:19:55 2018 -0800

    Merge conflicts

[33mcommit 73b7e1e259baf064e764e14cdfe17697d6830553[m
Author: nturinski <naturins@microsoft.com>
Date:   Fri Nov 30 14:29:02 2018 -0800

    Implement deployments node

[33mcommit 8003000d525c38e4533837e94bfb7240100f9b40[m[33m ([m[1;32mmaster[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 28 16:16:55 2018 -0800

    Bump version of mocha to get rid of growl warning (#834)

[33mcommit 30b118f9cdf4b417cd4991a9eccfdc2c86dcdada[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 28 14:55:32 2018 -0800

    Change default venv from 'func_env' to '.env' (#828)

[33mcommit 8a1278bde08d14a637b2128ff076712ce0491a56[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 28 14:54:55 2018 -0800

    Remove Python feature flag (#829)
    
    Also I'm not sure why Java didn't have "(Preview)" in it's description. It should since that's still in preview in Azure.

[33mcommit b3438288f5a6e9d6e01a7bd3e95b099c2573ef36[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 28 14:54:28 2018 -0800

    Group deploy commands together (#824)

[33mcommit 3c3477578e62b819be37ddb04a2867e3acf9bd8a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 28 13:24:57 2018 -0800

    Validate that preDeployTask succeeded (#827)

[33mcommit 596a22d67749e6dcace0d6a0a6ccf2ffa72b1ba9[m
Author: David Watrous <ritdave@gmail.com>
Date:   Wed Nov 28 11:52:03 2018 -0500

    Removed package-lock.json from .gitignore (#820)

[33mcommit 7808eca69d5adcdd8a0edf65d3ee8a54a4f61fc1[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Nov 26 15:01:04 2018 -0800

    Bump minimum version of "ps-tree" due to "event-stream" bug (#818)

[33mcommit 08a04b09e62a10c7c630452a0624eddb0076dea2[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Nov 19 14:59:58 2018 -0800

    Allow user to overwrite app settings in case of error (#801)

[33mcommit ccc96b822ed60acaa78f05fe6e1ed5e7151e6ae0[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Nov 19 14:26:37 2018 -0800

    Set default deploySubpath for C#Script (#793)

[33mcommit 7bd129be5536e344456fc7190a7ef6163a68c356[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Nov 19 13:22:00 2018 -0800

    Add telemetry on whether func is installed (#813)

[33mcommit 3c5fd5ba36591f7e79fc50378aa59922afa60361[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Nov 19 13:18:41 2018 -0800

    Return empty api provider (#812)

[33mcommit 8fdb1ed958b58e455569389b3537547ce1883777[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Nov 15 13:45:29 2018 -0800

    Add preview support for slots (#803)

[33mcommit 923b5261e58c7a78779a853b86915bd32fcd3c21[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Nov 15 13:41:15 2018 -0800

    Enable python project test (#809)

[33mcommit 7c32c6b5a6995fadb18df4c90e967726da99e2d9[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Nov 15 13:40:58 2018 -0800

    Improve python alias selection (#795)
    
    Here's the new experience:
    1. Don't prompt user if we find an exact 3.6 version (this _does_ take into account the max version)
        1. Try "python.pythonPath" first if set as a user setting (so that user can override this "black box" if necessary)
        1. Try "python3.6" and "py -3.6" second per advice from python team
    1. Otherwise, prompt if we don't find exact 3.6. The prompt does _not_ validate on max version because I don't want to block users once they add support for 3.7+

[33mcommit 9c41e64564c75f2f4bb7fddc8561985211999222[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 14 11:56:23 2018 -0800

    Update to latest UI package (#806)

[33mcommit cf6bf0ee707ad0232cc99359b4c2d1cafff8345b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Nov 8 10:57:34 2018 -0800

    Add node_modules to default gitignore (#800)

[33mcommit 479b2fa7dcb47d8330060a87155b326bf4c910fb[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Nov 6 11:19:14 2018 -0800

    Fix template source logic for C# tests (#787)
    
    So I realized that the C# tests weren't actually running tests based on the different template sources since they overwrite the nuget package in the same location. The key fix was to change the location from:
    ```
    path.join('resources', 'dotnetTemplates')
    ```
    to
    ```
    path.join('resources', 'dotnetTemplates', ext.templateSource || '')
    ```
    
    The rest of the changes are based on that and a little bit of refactor. There should be no functional changes.

[33mcommit 2b3d51a0d6e976ee98d81cc3499cef6e2040292b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Nov 6 10:57:17 2018 -0800

    Refactor project code (#786)

[33mcommit e865a05c1269c7e4a366377071fb2cae68aa5e8b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Nov 6 10:40:13 2018 -0800

    Fix PR builds from forks (#791)

[33mcommit 78d435c0d47027cb22b69f4270654488f29ef62c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Nov 1 11:17:17 2018 -0700

    Finish up pipelines setup (#778)
    
    * Change badge on readme
    * Add "ComponentGovernance" task. Rather than manually register every third party tool we use, It automatically does it for us.
    * Simplify publish-vsix
    * Clean up "install-azure-account"

[33mcommit b61db77409b38b8e77da956f06923cbdb5829f1b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Oct 31 12:17:30 2018 -0700

    Switch from TravisCI to Azure Pipelines (#767)

[33mcommit 2e86e7f39de2b19c189c1fe953146f8146a78014[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 30 14:32:17 2018 -0700

    Minor improvements from UI package (#771)
    
    Just leveraging a few things from the latest UI package to clean up the code: https://github.com/Microsoft/vscode-azuretools/releases/tag/v0.18.5-ui

[33mcommit c579ad770086deb3e1d777bd2afc1734d45b018e[m
Author: Alex Weininger <alex.weininger@live.com>
Date:   Mon Oct 29 08:29:17 2018 -0700

    Made "initProjectForVSCode" command use title case. (#769)

[33mcommit 905ff5de0751774c25b5695786511634931f2c6c[m
Merge: 80142b1 8298176
Author: Stephen Weatherford (MSFT) <StephenWeatherford@users.noreply.github.com>
Date:   Fri Oct 26 12:11:04 2018 -0700

    Merge pull request #763 from Microsoft/saw/load-time
    
    Add load time to telemetry, fix tasks issues

[33mcommit 829817667af7f8dd1ce738613fe51ff11fc0f474[m
Author: Stephen Weatherford <stephwe@microsoft.com>
Date:   Fri Oct 26 11:59:09 2018 -0700

    Add load time to telemetry, fix tasks issues

[33mcommit 80142b102e6aa509bad912771d897d6265bc1f61[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 23 14:03:01 2018 -0700

    A few engineering improvements (#762)
    
    1. Update typescript version
    1. Update tslint version
        1. One of my favorite new rules is "no-implicit-dependencies" which makes sure you have a dependency listed in "package.json" if you're using it. A month-ish ago we had a problem where the storage package was listed as a devDependency instead of a dependency and this rule would've prevented that
    1. Update to next alpha
    1. Clean up tasks.json/launch.json
    1. Set 'DEBUGTELEMETRY' on launch since gdpr is updated daily now

[33mcommit 2e32d31b53dd14871034ef1fcc3dd83c82390621[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 22 13:39:44 2018 -0700

    Fix copyCSharpSettingsFromJS based on new names (#750)
    
    The templates names changed and 'normalizeName' no longer works. Switch from using 'name' to 'id' as we should've been doing all along. C# templates still work without this PR, but they're just missing a few niceties as described originally here: https://github.com/Microsoft/vscode-azurefunctions/pull/458

[33mcommit eba0da098c88467191159a05d7302dc5b3867759[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 22 13:34:24 2018 -0700

    Fix C# project creation logic to handle 'netcoreapp' (#754)
    
    Looks like C# project used to default to 'netstandard2.0' and now they default to 'netcoreapp2.1'

[33mcommit 930ffc0014e4607231782a977530a4921e26f501[m
Author: Nathan <naturins@microsoft.com>
Date:   Fri Oct 19 16:55:23 2018 -0700

    Nat/changelog (#746)
    
    * Add known python issues

[33mcommit dfa37fa4d216cd313b3c9a4411fc04e01acef9f1[m
Author: Alex Weininger <alex.weininger@live.com>
Date:   Fri Oct 19 16:01:18 2018 -0700

    Added mit license badge (#744)

[33mcommit 96aeddf9958ffd3cc1477d9f959a653331db7759[m
Author: Nathan <naturins@microsoft.com>
Date:   Fri Oct 19 11:32:51 2018 -0700

    Add host attribute (#743)
    
    * Add host attribute, remove server and file
    * Use 127.0.0.1 rather than localhost

[33mcommit 7ac5e8a8f15cfaa524c76ad386c1743614c51c40[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Oct 19 11:02:07 2018 -0700

    Handle existing python virtual environments (#742)
    
    We still default to 'func_env' for new projects - but this improves the logic when detecting projects created from the func cli as described in the above issue. I introduced a `azureFunctions.pythonVenv` setting that is referenced directly from the "tasks.json" file.

[33mcommit bb4c8bdb646e7ce44e7a0d5173e9327e6791c149[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Oct 18 01:49:41 2018 +0000

    Move app settings logic to this repo for createFunctionApp (#731)

[33mcommit ef3e40a12fda0e1160c378336d8259db78d4fe6a[m
Author: Nathan <naturins@microsoft.com>
Date:   Wed Oct 17 18:42:48 2018 -0700

    Local git deploy path check (#732)
    
    * Local git deploy path check

[33mcommit 61f11e52d0d7e375d5b58e06f01e84e8e3f161e1[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Oct 18 00:44:39 2018 +0000

    Prep for 0.12.0 (#733)

[33mcommit 64bd35c152d3d20056073d6dc8da3275a93708fe[m
Author: Nathan <naturins@microsoft.com>
Date:   Wed Oct 17 17:17:27 2018 -0700

    Check for websitecontent setting prior to deploy (#698)
    
    * Check for websitecontent setting prior to deploy

[33mcommit ca07655fb1ed966eca17fe26a5acff7a0200f6b8[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Oct 17 22:23:31 2018 +0000

    Add test for createFunctionApp API (#728)
    
    And clean up tslint.json files

[33mcommit c40dcf9038bab5588773c7e068eebf06ccdf182a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Oct 17 21:11:57 2018 +0000

    Run tests against staging templates (#718)

[33mcommit 1879183bba332062463912b9c1ee4a197036ae4b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 16 21:26:52 2018 +0000

    Add CODEOWNERS (#725)

[33mcommit a4fb63ace175597c6b140aba1e9b609365dce60c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 16 21:26:17 2018 +0000

    Fix refreshLabel from new tree (#724)

[33mcommit 15c25877856f23e087e49c06511a9bc866f61ed3[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 15 15:48:53 2018 +0000

    Use double underscore instead of colon (#706)
    
    A colon has worked on all OS's for me, but I must've just gotten lucky. According to [these docs](https://docs.microsoft.com/aspnet/core/fundamentals/configuration/?view=aspnetcore-2.1#conventions):
    > In environment variables, a colon separator may not work on all platforms. A double underscore (__) is supported by all platforms and is converted to a colon.

[33mcommit fac8db6b49d356351e46b6e81f96310c4e6415b8[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Oct 11 23:15:56 2018 +0000

    Pass along runtime from createNewProject api (#707)

[33mcommit 8e0f098b3132121f23ac13a0760cdc03f91e61d3[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Oct 11 21:08:39 2018 +0000

    Actually use createTelemetryReporter (#705)
    
    I already did some of the DEBUGTELEMETRY stuff in this PR: https://github.com/Microsoft/vscode-azurefunctions/pull/663, but missed calling createTelemetryReporter, which actually sets up the DebugReporter. Also by using createTelemetryReporter that means I don't have to reference the `vscode-extension-telemetry` directly and can just rely on whatever version the UI package uses.

[33mcommit b2b9cf11f82d27ca17f76404e91ebfd8b20f5854[m
Author: Nathan <naturins@microsoft.com>
Date:   Thu Oct 11 10:11:48 2018 -0700

    Exclude obj and bin folders when creating a non C# project (#699)
    
    * Exclude obj and bin folders when creating a non C# project

[33mcommit 03b556d2643b6e6e115b9641cc66e94ad13d3d3d[m
Author: Nathan <naturins@microsoft.com>
Date:   Fri Oct 5 13:00:24 2018 -0700

    Check if deploying Python project to windows app (#696)
    
    * Check if deploying Python project to windows app.

[33mcommit c09e0690fa6b05b69d55d44f325a09af6e928c91[m
Author: Nathan <naturins@microsoft.com>
Date:   Thu Oct 4 16:47:15 2018 -0700

    Check for C#Script && v1 runtime to enable WEBSITE_RUN_FROM_PACKAGE (#695)
    
    * Check for C#Script && v1 runtime to skip enabling WEBSITE_RUN_FROM_PACKAGE

[33mcommit ae45568620e9286ccd84e6b3f9c8e334241d2276[m
Author: Nathan <naturins@microsoft.com>
Date:   Thu Oct 4 16:46:21 2018 -0700

    Show delete as a longRunning notification (#694)
    
    * Show delete as a longRunning notification

[33mcommit 90ede2d3526dfab8452ec97937470fe2c6bdf00c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Oct 4 22:21:43 2018 +0000

    Refactor to use new tree (#689)

[33mcommit 4177ad1d2a78a6ba60701608731d73b78448b230[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Oct 4 20:54:23 2018 +0000

    Fix getNpmDistTag for v1 (#678)

[33mcommit 476989ee4365b7651edbf4b513f48415241651d6[m
Author: Nathan <naturins@microsoft.com>
Date:   Thu Oct 4 11:09:49 2018 -0700

    Add shortcut key (#691)

[33mcommit 314f6cdf28f75445bc2dfc1a6f3856d442893935[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Oct 4 17:56:33 2018 +0000

    Get child process if func installed with npm on mac (#675)

[33mcommit 11a91cc08cda36d7530f654919e96ddcf4dc466e[m
Author: Nathan <naturins@microsoft.com>
Date:   Wed Oct 3 16:09:30 2018 -0700

    Integration tests for Azure commands (#494)
    
    * Integration tests for creating and deleting Function Apps
    * Global "longRunningTestsEnabled" variable that will disable tests that tend to run long

[33mcommit cecf3d63e2a7c91d1d60c174eb6827069460d411[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 2 21:31:17 2018 +0000

    Stop func host task after debug session ends (#671)

[33mcommit 13801d142707e85e34b9d8fc411906de634c361d[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 2 20:57:53 2018 +0000

     Add pip install command to python projects before debugging (#683)

[33mcommit d0edad27003b4ab06ab164e2bd35d798292928d5[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 2 17:49:23 2018 +0000

    Add a few things to Python gitignore (#680)

[33mcommit 5d0f9e58b8c3ef25f22ecaf77aff9654e2e3d056[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 2 17:48:10 2018 +0000

    Add pylint to Python projects by default (#681)

[33mcommit 5079799240e26ea71284d09d8defe760644cda14[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 1 22:08:37 2018 +0000

    Change endsPattern for 'func-watch' (#676)
    
    This 'endsPattern' is a signal that debugging can start, but turns out we may have been doing it too soon on some people's computers.

[33mcommit f2c09d8eb53300cbd057bf0ba89e9cee695157f7[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 1 21:39:29 2018 +0000

    Don't pop up debug console on F5 (#664)

[33mcommit a314100ce6cc12b5f5e0ee3a5656543f5a2397be[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 1 21:39:02 2018 +0000

    Make preDeployTask have scope 'resource' (#673)
    
    So that users can set this at the workspace _folder_ level if they want.

[33mcommit 27fca5982475e6818e587d940ad9d37e8409a125[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 1 21:38:46 2018 +0000

    Add Cosmos DB trigger to verified category for C# (#674)

[33mcommit 31bd9063f7ec0fd027ac27c73990ef658cf5ed1d[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 25 22:38:45 2018 +0000

    Improve tests (#663)
    
    Includes the following:
    1. Fix template tests so that we guarantee it's testing against cli feed _and_ backup templates (current code was just testing against cli feed twice)
    1. Remove a little bit of duplicate code in suiteSetup
    1. Turn off telemetry for tests
    1. Allow running a subset of tests with MOCHA_grep (super excited about this one - thanks Stephen)

[33mcommit c21eb558ddc0ca25034733521b674ea2a5d9dc08[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 25 20:07:35 2018 +0000

    Bump version to next alpha (#661)

[33mcommit ce4c9f9b47ea6df30627e6588d6fbd51b23d77b8[m[33m ([m[1;33mtag: v0.11.0[m[33m)[m
Merge: 5f92c18 e7786a3
Author: Stephen Weatherford (MSFT) <StephenWeatherford@users.noreply.github.com>
Date:   Sun Sep 23 18:32:20 2018 -0700

    Merge pull request #647 from Microsoft/ej/betaCreate
    
    Fix creating function app with beta setting

[33mcommit e7786a353bc4681400a8aa344b5653a748b3b9d2[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Sun Sep 23 12:39:20 2018 -0700

    Fix creating function app with beta setting

[33mcommit 5f92c1803a385a994ea3718a64952d50cd6ae56e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Sep 21 17:26:49 2018 -0700

    Ensure func_env is in .funcignore (#637)

[33mcommit 4ccfc674e99a7c15f94369ee0c4c84802ea459a6[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Sep 21 12:39:00 2018 -0700

    Fix separator for executeCommand on windows (#636)
    
    And switch from '|' to ';'

[33mcommit 8d822ac20d9fd48c1a8b774f69d7878631c3f46a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Sep 21 11:51:22 2018 -0700

     Better error message when failing to list functions on linux (#635)

[33mcommit b3250944987ddcb70cb5b0c860f3c6a67fdf36c5[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 20 18:22:30 2018 -0700

    Bump appservice package to fix linux deploy (#633)

[33mcommit dec20ea62b7e880a4672c6cb95eb2b976ddc5135[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 20 17:37:42 2018 -0700

    Always use v2 for Python (#629)

[33mcommit 67f2858ca8bf7ecacb2cab587edef8f906750576[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 20 16:59:37 2018 -0700

    Make python venv work on linux (#623)

[33mcommit 40ad9b53e12e52fc1be308de9904a91ea282f34c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 20 15:46:39 2018 -0700

    Improve Python version parsing (#622)

[33mcommit 43e055c3f3283de41d587e6b228c8d809be69a86[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 20 13:04:07 2018 -0700

    Give "azureFunctions.deploySubpath" setting more precedence (#620)
    
    We've had multiple customers fail to deploy because they selected "Deploy to Function App" from the wrong sub folder of a project. This hopefully fixes that in two ways:
    
    1. Use "azureFunctions.deploySubpath" instead of the folder they select. Users will get a warning.
    1. If there is only one workspace folder open and the deploySubpath setting is not an empty string - just use that path without prompting the user at all.
    
    C# already has "deploySubpath" set on new projects. I modified Python and JavaScript to also set it.

[33mcommit 327a05de2d08620eedab6855ee8ee4f226d08bd0[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 20 12:01:41 2018 -0700

    Fix initProjectForVSCode for python projects (#621)

[33mcommit 5a136720e81f7e348779d219df22704bd938dcc2[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 19 14:56:09 2018 -0700

    Move over to common invalid tree logic (#613)

[33mcommit 3a37454c8cbdf3ef6f07565a98cd3888dea78450[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 19 14:44:01 2018 -0700

    Prep for 0.11.0 release (#614)

[33mcommit 10531928eb743492185b56c00330144208e79f68[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 19 11:16:57 2018 -0700

    Clarify preview support for Python (#609)

[33mcommit 806665e9b2ddf374d3597c85d38083ce85188228[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 19 10:01:05 2018 -0700

    Prompt user to re-create Python venv if it doesn't exist (#612)

[33mcommit d1f32f9b46536c805be903558646977f28ab8b83[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 19 08:46:58 2018 -0700

    Add separate tree item for invalid function (#611)

[33mcommit 90136e1b0531cfe17071da62c58683b3669f24e3[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 18 18:53:22 2018 -0700

    Force users to have workspace open when deploying (#606)
    
    We check several settings when deploying and we can't read/write those if the folder isn't open in the workspace

[33mcommit b5b681ead617d3c9923567f130d0cbd8815751c5[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 18 18:35:44 2018 -0700

    Add service bus to verified templates (#607)
    
    Now that we have support for installing func extensions, we can add a few more templates to the "verified" category.

[33mcommit f79a341b59921d6b3500b12bb5f7fc6003547f52[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 18 13:34:15 2018 -0700

    Dynamically retrieve appropriate dist-tag for npm (#610)
    
    The tags are changing when v2 GA's soon. We could hard-code the new strings and try to time our release perfectly with the func cli, but I'd rather dynamically check the dist-tags.

[33mcommit 0c0829d4d4a565e6e9f2e0681575ab1d6a55b2bb[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 18 09:55:04 2018 -0700

    Use long running notification when creating a project (#600)

[33mcommit 7e55c2596104c97bb578f67130b5d2f7a39db55d[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 18 09:21:47 2018 -0700

    Use admin api to get function keys (#605)
    
    Based on the discussion here: https://github.com/Azure/azure-functions-host/issues/3411, the kudu api is deprecated and the ARM api is not ready. However, the admin api works

[33mcommit d6fbb6caf1e49877e59675f529d0c3b8fbc706da[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 18 09:19:34 2018 -0700

     Don't use storage emulator on mac/linux for python projects (#601)

[33mcommit c07053b1f7d3d7bc21f8644a47744ba00f3fbfee[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Sep 17 17:34:26 2018 -0700

    Allow creation of python function apps on linux (#599)
    
    Also default to 'WEBSITE_RUN_FROM_PACKAGE' for non-python apps since that just GA-ed

[33mcommit 0918e8e135a4d0e331a650e4faff4725535b5fa4[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Sep 17 13:10:45 2018 -0700

    Prompt for python path instead of just error (#598)

[33mcommit f9fdd4a7413706ae4c6e14fee343317bd1671da3[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Sep 17 13:09:45 2018 -0700

    Show local settings file after downloading (#595)

[33mcommit 65724f882ce7e23b53b6e5aa3292a33aeabd0718[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 13 16:59:37 2018 -0700

    Move linux consumption deployment to shared package (#597)

[33mcommit b7d8f9d7b8307aad33e8d2989aa544b206496389[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 13 09:46:31 2018 -0700

    Add install/update command (#596)

[33mcommit 94ce0a12420f6974c316bdeefe9600d1b3e39958[m
Author: Nathan <naturins@microsoft.com>
Date:   Wed Sep 12 18:46:17 2018 -0700

    Include func extensions install in Run Functions Host task (#588)

[33mcommit 0f0b91b810b14db5a6b4be4f48c4689673536ac3[m
Author: Nathan <naturins@microsoft.com>
Date:   Wed Sep 12 17:18:27 2018 -0700

    Install ptvsd and other local debug fixes (#582)
    
    * Install ptvsd and other local debug fixes
    * Check to see if .gitignore includes func_env/pythonpackages

[33mcommit 49a26c82f54bab68af38b100748ac990675ac004[m
Author: Nathan <naturins@microsoft.com>
Date:   Wed Sep 12 16:45:34 2018 -0700

    Nat/storage from setting (#586)
    
    Uses the AzureWebJobsStorage app setting for storage account

[33mcommit de998312f0c6e01bf425d24bad73dda3eeae716f[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 12 16:40:48 2018 -0700

    Add python verified templates (#585)
    
    And Cosmos DB trigger to v2 JavaScript

[33mcommit 8f89b0badde5f967390fe2614f5e2a158816b0e9[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 12 15:16:49 2018 -0700

    Change pythonExperimental to python for non-windows (#579)

[33mcommit 38b781d852597cabfd8486418834f0a167037b05[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 12 15:11:35 2018 -0700

    Change beta to ~2 (#581)

[33mcommit 806bd74ff9cef98014dc8f75501095857fe9b2b2[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 12 10:28:51 2018 -0700

    Update to next alpha (#580)

[33mcommit 2d03c5652854f969725be7cd4a4263e20b72881f[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 12 10:19:48 2018 -0700

    Contribute func-watch problemMatcher (#578)
    
    I'm basically shifting the implementation of the problem matcher from each user's project to our extension. This means we can change/improve it in the future without having to modify the user's project.
    
    Unfortunately, the func cli is very annoying to parse, so I only added support for one error (although it's somewhat common).

[33mcommit f5afb39c35fb97f0a71c52f3c60d20db35aa5abe[m
Author: Nathan <naturins@microsoft.com>
Date:   Tue Sep 11 16:35:44 2018 -0700

    Nturinski/runFromPackage (#574)
    
    Deploy logic for Linux Consumption Apps to leverage `Run From Package`

[33mcommit 91f495af05ac93588a86f01517a0a82f057c6b60[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 11 16:04:29 2018 -0700

    Move several function calls from kudu to ARM (#577)
    
    Linux consumption doesn't support kudu so this should help

[33mcommit 52432b8d38063fd6a95f11f57215c381cad6ec81[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Sep 10 11:44:36 2018 -0700

    Keep track of whether func task is running for pickProcess (#575)
    
    I incorrectly made the assumption that `vscode.tasks.taskExecutions` was the list of _running_ tasks, but it's actually a list of tasks that have _ever_ run in this session, even if they're not running right now.

[33mcommit 816a4392bbf227b071c8ecc4c7ad52e41a85cad9[m
Author: Hanxiao Liu <hanli@microsoft.com>
Date:   Sat Sep 8 06:30:07 2018 +0800

    Add guide for users to set maven path. (#530)

[33mcommit 631a368cc378035253e1eee9a12029e153fdb894[m[33m ([m[1;33mtag: v0.10.1[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Sep 7 11:41:02 2018 -0700

    Make pickFuncProcess more robust to timing issues (#573)
    
    As described in this PR: https://github.com/Microsoft/vscode-azurefunctions/pull/558, we have to get the inner 'func' process on Windows instead of attaching to the parent PowerShell process. Well it turns out there's a delay between when the PowerShell process is created and when it has the child process running the func cli. This change prevents us from attaching to the PowerShell process and getting "unverified" breakpoints.

[33mcommit aa5a99b4cb20a61351da2a283b0db8d24d7fb6a0[m
Author: Nathan <naturins@microsoft.com>
Date:   Fri Sep 7 08:51:01 2018 -0700

    Remove issue of Github in log (#571)

[33mcommit 71d1c25c817eb59e97ade83913a76feda9816d48[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 6 15:55:38 2018 -0700

    Fix "func extensions install" on v1 (#569)

[33mcommit f0d200e60c8ee7dba049d9df88b3dcde029c1086[m
Author: Nathan <naturins@microsoft.com>
Date:   Wed Sep 5 18:16:13 2018 -0700

    Add resourceGroup to createFunctionApp api (#551)

[33mcommit 1500f6204d17870d877040cad268a4a29dbb69ac[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 5 16:58:11 2018 -0700

    Prep for 0.10.1 release (#564)

[33mcommit 14855708f82af5dc498217d2a329d9773a12c7a6[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 5 11:35:07 2018 -0700

    Refactor pickProcess to leverage tasks api (#558)
    
    We've had a whole host of issues related to pickProcess for C# debugging. I was able to simplify this logic by leveraging VS Code's tasks api that was released a few months ago rather than searching the entire list of processes myself. The VS Code tasks api actually gives me the pid of the task, which is great.
    
    Unfortunately it's never that simple, though 😅 On Windows, it gives me the pid of the parent PowerShell process, not the actual func process. In order to find the child process, I decided to leverage the windows-process-tree module that's created for and shipped with VS Code, which is a native windows module and avoids a lot of the problems we originally ran into with wmic (which most other modules like 'ps-node' use).

[33mcommit 3762024b2723a8fb492af8824bd86d1c38c019f4[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 4 11:16:30 2018 -0700

    Update backup templates post breaking changes

[33mcommit d91e983728271ebef316706a2b53f988a9df63ef[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 4 11:12:24 2018 -0700

    Format backup script templates

[33mcommit b3e5b1b7373193b3208a9dbd56599e731e273394[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Aug 31 15:25:47 2018 -0700

    Run 'func extensions install' before debug/deploy (#549)
    
    Users need to run `func extensions install` before debugging or deploying on JavaScript projects. This was always the case for some triggers (that we didn't "officially" support in VS Code), but it wasn't required on blob/queue triggers until the most recent functions release. Hence why we're adding this now.
    
    As part of this change, I made the C# 'preDeploy' logic more generic so that it would also cover the JavaScript `func extensions install` case. I also changed the C# logic so that it won't run for local git deployments, since that should be covered by kudu.

[33mcommit 494e20331eaa6bf80478372a67e78c29cc36c119[m
Author: Nathan <naturins@microsoft.com>
Date:   Fri Aug 31 14:51:56 2018 -0700

    Python Project Creating/Local Debugging (#525)
    
    Create and locally debug Python functions projects.  Option to create is still hidden as Python is still in preview and we are working on the deployment scenario.
    
    In order to debug, `python -m pip install --pre ptvsd` must be run within the project's virtual environment.  There is also a dependency on the experimental Python Extension, but they should release on Tuesday, 9/5/2018.

[33mcommit f3de5b2b08c5ff478e5e015bd2482bf9fb886670[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Aug 30 14:56:52 2018 -0700

    Add button to Stream Logs after deploy (#541)

[33mcommit 3cde8338b685f79cc3f4ee6a94f7806f162a3bb4[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Aug 30 10:53:47 2018 -0700

    Ensure spaces and special chars are preserved (#538)

[33mcommit bb979fd9f34ef119de4e9b04451bf27d93ae72b1[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Aug 30 10:44:16 2018 -0700

    Fix maven arg being passed incorrectly (#539)

[33mcommit 7fe867570fcf97cd676ea3b055589c3da63ba028[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Aug 30 10:43:20 2018 -0700

    Add AzureFunctionsVersion when creating C# projects (#540)

[33mcommit 02aaa551eca1ac15eab8200433bce3ab10e22361[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Aug 30 08:24:46 2018 -0700

    Handle failure to list function apps for new subscriptions (#536)

[33mcommit 04605b514ba6d9129c12d1e7bffa95ce6d919297[m
Author: Hanxiao Liu <hanli@microsoft.com>
Date:   Thu Aug 30 23:17:10 2018 +0800

    Use different quotation mark based on platform when running maven command (#533)

[33mcommit 95380e95b8565996e39d3accf34e4419a5c4f74e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Aug 28 15:55:49 2018 -0700

    Add VS marketplace badges to README (#532)

[33mcommit e0d12c447e5b4744e947ca0f857d887c409add64[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Aug 28 13:42:30 2018 -0700

    Fix duplicate identifiers when linking npm packages (#531)

[33mcommit 8d8a6e60a82ac103653333094a50b84fe27bfe6e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Aug 28 08:26:44 2018 -0700

    Add host.json version (#528)

[33mcommit 6906533b632843e4fbec5062ac0314a360df9d63[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Aug 27 13:37:51 2018 -0700

    Leverage latest ui and appService packages (#526)
    
    This includes breaking changes for the following:
    1. Sovereign support for wizards https://github.com/Microsoft/vscode-azuretools/pull/246
    1. Persisting log streams is now handled within the shared package (rather than tied to the nodes in the tree) in order to fix a few bugs mentioned in this PR: https://github.com/Microsoft/vscode-azuretools/pull/245

[33mcommit bec0e11313d9369e920d138682c4acc4cee75198[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Aug 23 14:02:10 2018 -0700

    Update azure-arm-website to non-preview version (#523)

[33mcommit c07f1713251f7169de85b840379c875428ef0a1c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Aug 23 08:37:28 2018 -0700

    Show invalid function apps separately (#524)
    
    In other words, don't let a single invalid function app block other valid function apps from being displayed.

[33mcommit 7fcc64741dd2f1f514b74c092f89229c1b46ceaf[m
Author: Dinica Ion (Dini) <ion.dinica@gmail.com>
Date:   Mon Aug 20 19:03:15 2018 +0300

    Persist log stream outputChannel even after disconnect (#501)

[33mcommit a7520b21f45bf1182996e1392abb18598954d794[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Thu Aug 16 23:33:35 2018 +0800

    Move parseJavaTemplates to its own file (#512)

[33mcommit c1711d42f6a636a49453f7b93e845175ef4acd6c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Aug 14 10:11:19 2018 -0700

    Leverage backup templates

[33mcommit 67dd1db1cc5e619e79629a4f27e789f37a421241[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Aug 14 09:56:56 2018 -0700

    Add backup templates

[33mcommit 51ddf8878f60add84de466abc2bc269fe6f14cce[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Aug 13 15:39:02 2018 -0700

    Update to next alpha (#508)

[33mcommit e8d01442f18d1d83cd636e08acaf79a584428988[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Aug 13 14:56:48 2018 -0700

    Add proxies.json back to default project (#507)

[33mcommit f23e8ba84bcca63898774549ac09281f58b8157c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Aug 13 13:24:47 2018 -0700

    Ensure C# runtime logic is always run (#506)

[33mcommit 9052d1744c4770d5066b19f0c5f9ec3b245f6478[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Aug 13 13:19:09 2018 -0700

    Process postActions for .NET Templates (#503)

[33mcommit 56a097178f1deac96f69cac174be26f2c2899825[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Tue Aug 14 01:09:29 2018 +0800

    Dynamically retrieve Java templates using `mvn azure-functions:list` (#487)

[33mcommit 4aff7d9595e90b4c1f8ac31d5f6d624a72176afb[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Aug 2 15:10:33 2018 -0700

    Add source code for JsonCli tool (#488)

[33mcommit 13a4eef2393ca16e007348bafb91003ac1698a7d[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Aug 2 10:38:47 2018 -0700

    Update to latest telemetry package (#492)

[33mcommit 8098376f4c161497fd03904b6344278cc7476dae[m[33m ([m[1;33mtag: v0.10.0[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jul 24 13:39:44 2018 -0700

    Fix range error when creating new function app (#481)

[33mcommit b56a2b0ccddac99993891204250fc17f6898ad16[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Jul 23 16:37:03 2018 -0700

    Update debug config for node projects due to breaking changes (#478)

[33mcommit d009cf1a63f3f601eccb31983d82e15c39b266a7[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Jul 19 10:53:41 2018 -0700

    Temporarily remove proxies.json (#472)
    
    Due to https://github.com/Azure/azure-functions-core-tools/issues/562

[33mcommit d0a0e0c81240ea1d90dc84bbb887625788dfec60[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jul 18 15:42:17 2018 -0700

    Fix accessRights not being passed (#470)

[33mcommit 4f981f1a0a22814c9fc4c42cabf047649f96c01d[m
Author: Nathan <naturins@microsoft.com>
Date:   Wed Jul 18 15:41:04 2018 -0700

    Learn more link (#469)
    
    * Learn more link

[33mcommit f7e17628eb0b1d117518c949da592440fabf2949[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jul 18 14:57:20 2018 -0700

    Prep for 0.10.0 release (#468)

[33mcommit d8822a75787a473e2450a0a5fdf50604b7ae3b10[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jul 18 13:20:15 2018 -0700

    Add FUNCTIONS_WORKER_RUNTIME to local settings (#446)
    
    The only three values currently accepted are 'node', 'java', and 'dotnet'. The java and dotnet values should be fixed directly in the templates for the maven and dotnet cli.

[33mcommit c4297c66c150b8546d8db582489fcf236142c4bf[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jul 18 13:19:24 2018 -0700

    Automatically append deploySubpath for root of workspace (#464)

[33mcommit 874a3f014cba5eb89d7b495662dcf37bed3674f7[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jul 18 12:10:46 2018 -0700

    Fix error in logic when checking for publish task (#465)

[33mcommit 30cf24b56a3a2dabf629f1890306b312a90746ff[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jul 18 12:10:26 2018 -0700

    Check for existence of nuget packages before getting cached .NET templates (#467)

[33mcommit 47d5e63de3f6ff620fce46f7380bd9553e8548d7[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jul 18 10:52:41 2018 -0700

    Fix error when downloading app settings to empty file (#461)

[33mcommit eb435356ab8c3cf9619ed04619958a2781402d9a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jul 18 10:51:45 2018 -0700

    Add a few more verified templates to C# v1 (#463)
    
    Since we now have more templates available, I tried to make this list match the verified templates for JavaScript. v2 is exactly the same for both (just 4 templates). JavaScript has 8 for v1 while C# only has 7 (it's missing the ManualTrigger for some reason).

[33mcommit 9d509ba0108156f7d10fae505d64f611590fc43b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jul 18 10:51:11 2018 -0700

    Add setting validation and Azure prompts back to C# templates (#458)
    
    We lost setting validation and some Azure-specific prompts when we switched to dynamic retrieval of .NET templates. Fortunately, we can pretty easily copy this information from JavaScript templates. We only do this if the template name and setting name match exactly, so it will default to the plain-old .NET experience when applicable.
    
    I also leveraged the 'Documenation' information that is supplied with the .NET templates. This is the one case where these templates actually provide more information than the JavaScript templates.

[33mcommit 295f2460dcddc991ae17bb32302e2da9b7ee3113[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Wed Jul 18 11:40:44 2018 +0800

    Track maven errors in telemetry (#448)

[33mcommit 3c65d5596bc7c0ff8f2ac106793690610052a5af[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jul 17 16:12:42 2018 -0700

     Dynamically retrieve .NET templates (#457)

[33mcommit 72477583ab16af8e37914f863a97ddf84b2ce213[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jul 17 14:00:11 2018 -0700

    Update to latest shared appservice package (#454)
    
    This requires confirming deployment directly from the extension. Also cleaned up the onNodeCreatedFromQuickPickDisposable code a little bit similar to what Nathan did in App Service

[33mcommit 094e2f1c3e5d37aedd80c75ab5008a3c75937a61[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Sat Jul 14 00:50:45 2018 +0800

    Add debug argument for java when starting function host (#449)

[33mcommit e5a741b1c96a92bbda510bc786a4dd115f92b36a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jul 11 11:04:00 2018 -0700

    Get latest version of runtime separately for brew vs npm (#447)

[33mcommit a40a6403bf989e8d6a134327f9bfff21b9f927c9[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jul 10 15:53:47 2018 -0700

    Add user agent to Azure calls (#445)

[33mcommit 00a0ee2f9428a07a4dd5b77981d313a3c3927e23[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jul 10 09:56:37 2018 -0700

    Retrieve the function version and node version from the cli feed (#444)

[33mcommit d5c58e093c34511698c9f4cff181bba1900d5605[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jul 10 09:46:54 2018 -0700

    Add default proxies.json file (#443)

[33mcommit 8eab563b92a21132c921591b6fadcd094201a0f8[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Jul 9 13:14:44 2018 -0700

    Register common variables rather than passing them to shared package all the time (#434)

[33mcommit 962ce508aef01a14ff075c4cd41ce1a397a2f3fa[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Jul 6 14:25:58 2018 -0700

    Get rid of "We've Moved!" message (#441)

[33mcommit b8eca0737eaf47944f40356ee1bcc41230be5f0d[m
Author: Martin Kromkamp <m.kromkamp@gmail.com>
Date:   Fri Jun 29 23:00:47 2018 +0200

    Added Ubuntu 18.04 installation instructions (#433)

[33mcommit 3b4ec3aa0d16c580adec3fc7795d8bf81d2a0d04[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Jun 28 13:47:36 2018 -0700

    Standardize ellipsis and casing for commands (#430)

[33mcommit 9250a84c85b7fa7ab500d49a275afc9fa3550046[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jun 27 14:31:15 2018 -0700

    Leverage 'func --version' with newer versions of the cli (#429)

[33mcommit 8e1e50a2c77956c6072545c306f613e4cb5787b0[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jun 27 14:27:18 2018 -0700

    Run publish task before every csharp deploy

[33mcommit e416969796d133918d5a644f1293522586dc2905[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Jun 25 14:46:40 2018 -0700

    Make function.json parsing less strict (#409)

[33mcommit 63c8ccdb915f458fc6dcddcca076cdf05a86c7ea[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Jun 25 14:46:18 2018 -0700

    Fix func update for brew and add uninstall (#425)

[33mcommit 1c821ac31d554931e027fb4d4f70e0bc70796d8c[m
Merge: 46e6ab7 ea850bd
Author: Stephen Weatherford (MSFT) <StephenWeatherford@users.noreply.github.com>
Date:   Wed Jun 20 14:51:53 2018 -0700

    Merge pull request #422 from Microsoft/saw/updateui
    
    Update ui to 0.15.0

[33mcommit ea850bd7aebfe478d49d626f224208adf6243853[m
Author: Stephen Weatherford <Stephen.Weatherford@microsoft.com>
Date:   Wed Jun 20 14:47:09 2018 -0700

    Fix build

[33mcommit 8a986a9a35c243edebac485dc188581bdefc2df3[m
Author: Stephen Weatherford <Stephen.Weatherford@microsoft.com>
Date:   Wed Jun 20 14:33:19 2018 -0700

    Update ui to 0.15.0

[33mcommit 46e6ab7b9eea43b197c0a1e858427726aadf22dd[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jun 20 10:25:19 2018 -0700

    Automatically retrieve dotnet templates from cli feed (#421)

[33mcommit 3f34d19f53d18b2b5c74cd2c6aae3f0933a3faa9[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Tue Jun 5 23:15:57 2018 +0800

    prompt the user to select the language if there's a csproj file and pom.xml (#410)

[33mcommit c7e50bc903cd454e5128a8e2e8a5edb33f1f12ea[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Jun 4 11:18:23 2018 -0700

    Don't run 'git init' if already inside a repo (#408)

[33mcommit 2938973010a1c067beea58704049d96f01f21165[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Tue Jun 5 00:55:29 2018 +0800

    fix the bug when init java function project (#395)

[33mcommit 3ba757e4d7ad52222a20b13910852e16abada1eb[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu May 31 10:23:10 2018 -0700

    Update to next alpha (#401)
    
    And remove hard-coding of kudu package version (which was only done for the bug-fix release)

[33mcommit 2839462a3eae108226aacf993d0f516a5e233450[m[33m ([m[1;33mtag: v0.9.1[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed May 23 13:40:02 2018 -0700

    Prep for 0.9.1 release (#392)
    
    The release is due to [this bug](https://github.com/Microsoft/vscode-azurefunctions/issues/387), but doesn't actually fix the bug itself (the real fix needs to be in the func cli). However, this release mitigates the bug by giving us the ability to 'turn off' the prompt to install the latest func cli (since Nathan [just changed](https://github.com/Microsoft/vscode-azurefunctions/pull/391) it to an aka.ms link).
    
    I did a few additional things:
    1. Stop displaying errors in the output channel. I think they're more confusing than helpful (NOTE: `this.suppressErrorDisplay` is still on even though I removed the try/catch, so users will NOT see these errors)
    1. Temporarily hard-code the kudu package to the version used with the last release. I want to keep changes as small as possible for this bug-fix release

[33mcommit c2ba82f8d96b8a7318ed229b003c0bfec5365e09[m
Author: Nathan <naturins@microsoft.com>
Date:   Tue May 22 11:43:34 2018 -0700

    Change npmjs link to aka.ms (#391)
    
    * Change npmjs link to aka.ms

[33mcommit fd7ebf96d4b100c393adb28810832239ef3df632[m
Author: Nathan <naturins@microsoft.com>
Date:   Tue May 22 11:04:22 2018 -0700

    Nturinski/fix test (#390)
    
    * Add input for installing func cli prompt

[33mcommit 1815c8a20583cde745e3239319c0f3ee587f197c[m
Author: Nathan <naturins@microsoft.com>
Date:   Mon May 21 16:50:10 2018 -0700

    Add try/catch to tryGetTemmplateVersionSetting (#389)
    
    * Add try/catch to tryGetTemmplateVersionSetting
    * Add telemetry

[33mcommit 5eb4973ced93e2718286cf5a196129dc3fd2a3b5[m[33m ([m[1;33mtag: v0.9.0[m[33m)[m
Author: Nathan <naturins@microsoft.com>
Date:   Tue May 15 09:03:26 2018 -0700

    Fix getting templates when offline and clean up getting templates (#373)

[33mcommit b07f7253b7ccbf532767f3db22ec30b83a6a33fb[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu May 10 16:26:23 2018 -0700

    Update gifs in README to reflect latest version (#377)

[33mcommit 65a37a9f2ba6090bd4ac9b670098c3c7c179af9c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed May 9 22:56:50 2018 +0000

    Fix templateVersion description (#371)

[33mcommit b90cc11df614e1606c86e2785c0935b6dca79b0c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed May 9 19:33:47 2018 +0000

    Fix update/install (#367)

[33mcommit a140091763d884944ff6f4b641a8dfe29cbeb16e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed May 9 19:33:28 2018 +0000

    Fix null ref exception when there are no workspace folders (#368)

[33mcommit efbc1bb03cf96fcfa2f6778be05d0fb237f3d85a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed May 9 00:15:26 2018 +0000

    Prep for 0.9.0 (#362)

[33mcommit 69d4de3803b3cfc97af58c5782a59c3bf6973a11[m
Author: Nathan <naturins@microsoft.com>
Date:   Tue May 8 16:58:25 2018 -0700

    Nturinski/backout backups (#354)
    
    * Remove resource/templates, add backup user setting
    * Fixes semver issue, refactor verifyTemplates

[33mcommit 577056c0194163336d88439ff8d5b3b608116f0b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue May 8 23:40:10 2018 +0000

    Allow user to add new project to workspace (#360)

[33mcommit b692d1b63bdde62b2675a02443251254ca15dc26[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon May 7 22:57:38 2018 +0000

    Validate func installed when debugging C# projects (#357)

[33mcommit a1c2e78645b343c93b827eec5bbb997948dd4eee[m
Author: Nathan <naturins@microsoft.com>
Date:   Mon May 7 15:31:06 2018 -0700

    Remove Python creator (#356)

[33mcommit eaf2470a33fed271c0aa7139deed357688a4e7af[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon May 7 21:16:51 2018 +0000

    If creating a function _and_ project, leverage the same settings (#355)

[33mcommit f840c8e35ea3d85f70c29d6a69ad41cbdc98fd8a[m
Author: Nathan <naturins@microsoft.com>
Date:   Mon May 7 14:15:25 2018 -0700

    Update message updated (#353)
    
    * Update message updated
    * Ignore user cancels

[33mcommit 67a303f20e2f2c4089fe3ef5fc32761600ec0eed[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri May 4 23:40:27 2018 +0000

    Filter unsupported storage accounts (#345)

[33mcommit 6d64dfc7c7e066f2d3a745d9570f5b7a88827be9[m
Author: Nathan <naturins@microsoft.com>
Date:   Thu May 3 18:21:48 2018 -0700

    Add template version to output and don't show (#352)

[33mcommit 1564c5eab0cb815a11e931a49b35ec52efe4f92b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri May 4 00:19:12 2018 +0000

    Move explorer to Azure view container (#341)

[33mcommit 1aa00dd0e0c676c76c40f77c7bec90569f0c27a2[m
Author: Nathan <naturins@microsoft.com>
Date:   Wed May 2 16:40:56 2018 -0700

    Checks newest version through npm registry (#346)
    
    * Checks newest version through npm registry

[33mcommit 174e62c1761e58a11a3c77bc08620f3ddc0fce41[m
Author: Nathan <naturins@microsoft.com>
Date:   Tue May 1 16:51:02 2018 -0700

    Check local version with func and update if possible (#339)
    
    * Check local version with func and update if possible
    * Disable code regarding updating func core tools
    * Link to issue regarding func --version

[33mcommit e11c430fc4e1eef981936a12722c97ae70a4c9f4[m
Author: Nathan <naturins@microsoft.com>
Date:   Wed Apr 25 14:27:38 2018 -0700

    Download zip from Func Cli Feed (#330)
    
    Retrieve function templates from the Func Cli Feed as a zip

[33mcommit 0152ce6a366ad9ac919d484f5dff31823faf98d3[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Apr 24 22:45:55 2018 +0000

    Make confirmation dialogs modal (#335)

[33mcommit 406e38258aa0cb65c5dbc72511f0ff25b973bbf1[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Apr 20 00:26:47 2018 +0000

    Fix errors when 'local.settings.json' doesn't exist (#331)

[33mcommit ca054951589afcb1581be308cb384f0496d92bae[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Apr 19 18:17:50 2018 +0000

    Allow creating storage account for AzureWebJobsStorage (#329)
    
    I also moved the warning to after all of the function-creation stuff. That ways its less in-your-face. Plus creating a storage account can take a while and we don't want to stop the user from creating a function during that time

[33mcommit 66e16ecdcd6770ff25719770ac4bda6f52887e16[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Apr 17 20:42:33 2018 +0000

    Update to next alpha version (#325)

[33mcommit 20cd57688b3e97e40d4c42852cb51b063721ea61[m[33m ([m[1;33mtag: v0.8.1[m[33m)[m
Author: Nathan <naturins@microsoft.com>
Date:   Thu Apr 12 20:38:36 2018 -0700

    Custom Domain fix (#322)
    
    * Version bumps

[33mcommit 179a80713fc326c4cc3def70e4c00e2c68cfced6[m
Author: Martin Simecek <msimecek@users.noreply.github.com>
Date:   Thu Apr 12 22:29:19 2018 +0200

    Langauge -> language (#319)

[33mcommit f5a7e1747e43c1f2d2d65f4a20e0466c8f6a4dfd[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Apr 10 15:23:03 2018 +0000

    Rename files with '#' in the name (#316)
    
    VS Code doesn't handle files with '#' in the name well

[33mcommit 7dddfaa459f42dd4c2d28f84a637a43ac804754b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Apr 6 16:17:09 2018 -0700

    Update latest Cosmos DB package to fix build (#313)

[33mcommit 9e7b9eb29e8f60dce7c946f97a9c954abbc49698[m[33m ([m[1;33mtag: v0.8.0[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Apr 4 03:08:14 2018 +0000

    Show linux function apps (#312)

[33mcommit e1ad27abd3f1d9b7b1151ca1ea4b107dc6f1924e[m
Merge: b1ee080 5707473
Author: Nathan <naturins@microsoft.com>
Date:   Tue Apr 3 18:08:59 2018 -0700

    Merge pull request #307 from Microsoft/nturinski/installFuncCore
    
    Install func core

[33mcommit 5707473fb1c497f822fad40bcd28eb7ed7bad7e9[m
Author: nturinski <naturins@microsoft.com>
Date:   Tue Apr 3 17:52:09 2018 -0700

    Moved failure call outside of callWithTelemetry

[33mcommit f49ba9838cc2a499db4b06188fd2e2666042325f[m
Merge: 807bb7f 0ce7ff0
Author: nturinski <naturins@microsoft.com>
Date:   Tue Apr 3 17:43:28 2018 -0700

    Merge branch 'nturinski/installFuncCore' of https://github.com/Microsoft/vscode-azurefunctions into nturinski/installFuncCore

[33mcommit 0ce7ff09a53a6f4b917c33884c5d606dce7f96d3[m[33m ([m[1;31morigin/nturinski/installFuncCore[m[33m)[m
Author: nturinski <naturins@microsoft.com>
Date:   Tue Apr 3 17:02:11 2018 -0700

    Ahh, I'm not sure and I'm about to miss the busss sorrrryyy:

[33mcommit b1ee080410d507538860fc11eb451b62159f1482[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Apr 3 23:24:07 2018 +0000

    Update install instructions for azure functions core tools (#309)

[33mcommit f93bc57b4688ecbf39cc710f179c635b94e347ee[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Apr 3 23:20:06 2018 +0000

    Upload/Download app settings (#306)

[33mcommit 68ec159ee982e0b0e2493730c2600bd3324d6228[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Apr 3 23:16:53 2018 +0000

    Prep for 0.8.0 release (#310)
    
    * Fix mardown lint issues in changelog
    
    * Prep for 0.8.0

[33mcommit 384e99a02e97f755b680b85f2ff9162864026a73[m
Author: nturinski <naturins@microsoft.com>
Date:   Tue Apr 3 14:21:21 2018 -0700

    Remove finally statement because UI cancel triggers it

[33mcommit 6126f13c6f832a44e561a3d3264429c7b7b3ba2a[m
Author: nturinski <naturins@microsoft.com>
Date:   Tue Apr 3 14:16:55 2018 -0700

    I dunno why this keeps happening...

[33mcommit f8fd947bbd516ab4e3039b94c249e9de685d4c41[m
Author: nturinski <naturins@microsoft.com>
Date:   Tue Apr 3 14:15:00 2018 -0700

    Some npm fixes

[33mcommit 1d373b2c33349c5fa1889a643ec38e71c67150ac[m
Author: nturinski <naturins@microsoft.com>
Date:   Tue Apr 3 14:09:15 2018 -0700

    PR fixes

[33mcommit 5310d083a6378ee459c9d8e15e2dd0f9f19a85ff[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Apr 3 20:26:43 2018 +0000

    Fix error on delete (#308)
    
    When I added support for runWithTemporaryDescription, it had the side-effect of re-getting the state after the site was already deleted. We could fail to get the state in other cases as well and I think its best to just show the state as 'Unknown' instead of displaying an error message

[33mcommit 0a9ec092e5ed71ca1f7523c49da6c2f2393a6fb5[m
Author: nturinski <naturins@microsoft.com>
Date:   Tue Apr 3 11:47:29 2018 -0700

    Revert functionRuntimeUtils.ts

[33mcommit 807bb7f788a1dc7af79f0090989ef2bb0aa6c2a3[m
Author: nturinski <naturins@microsoft.com>
Date:   Mon Apr 2 19:28:16 2018 -0700

    Fix function def

[33mcommit 01a1aae9560e36705c980cb3b57b71dd71a7a9c4[m
Author: nturinski <naturins@microsoft.com>
Date:   Mon Apr 2 17:45:17 2018 -0700

    Fix if statement

[33mcommit 25810bf01d43e804525132f36e04e183e664cbcf[m
Author: nturinski <naturins@microsoft.com>
Date:   Mon Apr 2 17:41:26 2018 -0700

    Show warning if install fails

[33mcommit c64cfda70e3478ab3219c6e40dc3fba8166afe5d[m
Author: nturinski <naturins@microsoft.com>
Date:   Mon Apr 2 17:25:20 2018 -0700

    Refactor to create new project, add app setting

[33mcommit e9c9bf83a4198506459c6043566fcf8f9853ea09[m
Merge: db39aef 1ab95bf
Author: nturinski <naturins@microsoft.com>
Date:   Fri Mar 30 11:49:44 2018 -0700

    Merge branch 'master' of https://github.com/Microsoft/vscode-azurefunctions into nturinski/installFuncCore

[33mcommit 1ab95bf5eb3759cf6c45dc0e60b87852592ec4c2[m
Merge: eff9618 78e91ff
Author: Nathan <naturins@microsoft.com>
Date:   Fri Mar 30 11:26:35 2018 -0700

    Merge pull request #305 from Microsoft/nturinski/noDeployPrompt
    
    No deploy prompt for created nodes

[33mcommit 78e91ffaf7eb986a6135df42d3fb9048c1747af1[m[33m ([m[1;31morigin/nturinski/noDeployPrompt[m[33m)[m
Author: nturinski <naturins@microsoft.com>
Date:   Fri Mar 30 11:21:28 2018 -0700

    Non-null assertion

[33mcommit b788d801b2060169e5eb4750f86f6fe73fe416eb[m
Merge: a5a1b4a eff9618
Author: nturinski <naturins@microsoft.com>
Date:   Fri Mar 30 11:07:44 2018 -0700

    Merge master

[33mcommit eff96187fdd2cada9465c12786fab242413edd7b[m
Merge: 429a65a 0d23643
Author: Nathan <naturins@microsoft.com>
Date:   Fri Mar 30 10:58:12 2018 -0700

    Merge pull request #304 from Microsoft/nturinski/deployContextMenu
    
    Add deploy to function app context

[33mcommit 429a65a7bd18dc31f180c6432d397a1256db2097[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Mar 30 01:11:54 2018 +0000

    Allow function to be created with project from api (#303)

[33mcommit a5a1b4a845b0ecfd07d405148d394cedbd1c7b15[m
Author: nturinski <naturins@microsoft.com>
Date:   Thu Mar 29 16:31:27 2018 -0700

    Add type cast to shut up tsc

[33mcommit 2a529f70e4e8947a05f1f1dcaa983a65bbf85ccf[m
Author: nturinski <naturins@microsoft.com>
Date:   Thu Mar 29 16:18:09 2018 -0700

    Add event to deploy command to stifle deploy prompt

[33mcommit 0d23643be5f25ae4bea8ef7ef10665cac9b3c28f[m[33m ([m[1;31morigin/nturinski/deployContextMenu[m[33m)[m
Author: nturinski <naturins@microsoft.com>
Date:   Thu Mar 29 15:56:26 2018 -0700

    Add deploy to function app context

[33mcommit db39aef47de8e19404e3ea76126a2833771e2691[m
Author: nturinski <naturins@microsoft.com>
Date:   Thu Mar 29 11:20:29 2018 -0700

    Attempt installs on Mac/Win

[33mcommit 265d8d2b9281291362df0cb6e6586e61e8db06f6[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Mar 28 21:13:07 2018 +0000

    Leverage runWithTemporaryDescription from shared package (#300)

[33mcommit 3c62dfba492a5cad3b9b9409f3f3c5da569ca186[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Mar 27 20:23:42 2018 +0000

    Add learnMore for runtime mismatch (#299)

[33mcommit c3c15868e628e7db29fa6455bb48b0926f6c4e21[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Mar 27 15:00:49 2018 +0000

    Fix commandId for selectSubscriptions (#297)

[33mcommit 8a47e999cd1013d1771be2cbe2389243c51fd7d3[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Mar 27 14:54:20 2018 +0000

    Update ui package to leverage new subscription api on nodes (#298)

[33mcommit 585edecf4df798dd9975b85d800e716384fca106[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Mar 27 14:53:14 2018 +0000

    Run clean before build for C# projects (#293)

[33mcommit 67533e01fefe983a30fac9221dde63e65688be61[m
Merge: 6fcaec1 5ee7c4d
Author: Stephen Weatherford (MSFT) <StephenWeatherford@users.noreply.github.com>
Date:   Mon Mar 26 12:46:19 2018 -0700

    Merge pull request #294 from Microsoft/saw/selsub
    
    Select Subscriptions..., fixes #277

[33mcommit 5ee7c4d9c14d4a3f9ab1824567041a322c7565b2[m[33m ([m[1;31morigin/saw/selsub[m[33m)[m
Author: Stephen Weatherford <Stephen.Weatherford@microsoft.com>
Date:   Mon Mar 26 12:39:31 2018 -0700

    PR fixes

[33mcommit 6fcaec17d3da07fd1d79b5004987cb4ca36d6d34[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Mar 26 17:31:43 2018 +0000

    Refactor project constants (#295)
    
    As described in this PR https://github.com/Microsoft/vscode-azurefunctions/pull/269 I wanted to leverage some constants instead of repeatedly typing out 'host.json', 'local.settings.json' and '.gitignore'. I also moved several things from the ProjectSettings file to the constants file. I think the ProjectSettings file has a confusing name and I'd like to refactor that as a part of https://github.com/Microsoft/vscode-azurefunctions/issues/251 anyways

[33mcommit e104b294cc580843e5c783e9c49232e47e29c7a8[m
Author: Stephen Weatherford <Stephen.Weatherford@microsoft.com>
Date:   Fri Mar 23 18:53:10 2018 -0700

    Select Subscriptions..., fixes #277

[33mcommit 7aa966ad7e00e07d09fd5e93abc98133abf8c8cc[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Mar 22 21:36:15 2018 +0000

    Allow users to change settings when picking templates (#289)
    
    I honestly don't think users will change their runtime/language very often - this is much more about the visibility of the settings. Previously user's didn't know the settings even existed and didn't know what it was set to. That's why I wanted to make sure these never show up at the top as "(recently used)".
    
    The other big difference is that JavaScript projects will now default the runtime to the user's locally installed runtime (if we can detect the version). The positive: Users will have more consistent behavior between their local/remote function apps. The negative: "beta" users will see many fewer templates since "beta" doesn't have as many as "~1"

[33mcommit 3ed0f4b890074d69f996c21a81ee48812f2f49a3[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Mar 22 21:34:06 2018 +0000

    Fix '(recently used)' bug (#287)
    
    Since the description is sometimes set to '(recently used)', we should use the data field for any values.
    
    And leverage updated wizard

[33mcommit 4f79e4fe21a81ff3fbcb5ae672d7703119913eaa[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Thu Mar 22 23:48:17 2018 +0800

    Update the Java requirement (#290)

[33mcommit c5ccd14b27437646c4290b59c44d0ba697d292cd[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Mar 16 00:20:45 2018 +0000

    Move over to shared UserInput (#282)
    
    This fully moves over to the shared UserInput. A few highlights:
    1. My old implementation of QuickPickItems, showInputBox, and showQuickPick in this repo had actually diverged from the vscode implementation. I regret doing that now and a lot of this is just moving back to the vscode patterns
    1. Remove a custom implementation of displaying subscriptions and switch over to showNodePicker
    1. Make the 'showWorkspaceFolder' more similar to app service extension (where it displays path.basename as the label and the full path as the description)

[33mcommit a6172f7fed195531bcabfd2cc78b6f70e9b003dc[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Mar 15 21:31:50 2018 +0000

    Update to latest shared packages with new UserInput (#280)

[33mcommit 2947908913fc80b7f07941c3f4f0f1137f9b5409[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Mar 13 22:44:56 2018 +0000

    Leverage refactored siteWrapper (#275)

[33mcommit d03b4893a62639a727c8d83f5c17e6a6e5e6af87[m
Merge: 64e8a17 2430d97
Author: Stephen Weatherford (MSFT) <StephenWeatherford@users.noreply.github.com>
Date:   Mon Mar 12 13:22:06 2018 -0700

    Merge pull request #273 from Microsoft/saw/recommendations
    
    Recommend MarkdownLint

[33mcommit 2430d97a2a537b70261efa6be123235c1f90ecf3[m
Author: Stephen Weatherford <Stephen.Weatherford@microsoft.com>
Date:   Mon Mar 12 12:17:28 2018 -0700

    Recommend MarkdownLint

[33mcommit 64e8a1726eb252f2951596bacfe37a96c421759a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Mar 12 18:53:51 2018 +0000

    Add extension recommendations (#270)

[33mcommit b26bc8465870c3736ec990da281f9eab8c66ab57[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Mar 12 18:07:46 2018 +0000

    Generate and upload vsix to storage (#271)

[33mcommit c93373daea337217459a5aa804d7b11dbf8124dd[m[33m ([m[1;33mtag: v0.7.0[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Mar 8 14:52:18 2018 -0800

    Auto-detect functions projects that have been cloned (#269)

[33mcommit df0298c41e8246ca58cea00c2fcbe0b38835a490[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Mar 8 14:08:10 2018 -0800

    Fix prompt (#268)

[33mcommit 6f1fc11b8e6361967e96cf0bfc2cd7e0454d4260[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Mar 8 10:10:47 2018 -0800

    Fix typos in project doc (#265)
    
    * .vsode -> .vscode
    * Make headers consistent

[33mcommit 345f70e785222aa818eb7306ae656973c3235264[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Mar 7 15:33:48 2018 -0800

    Fix pickProcess on latest func cli (#259)
    
    The functions cli released a self-contained cross-plat version yesterday that no longer requires .NET Core 2.0 to be installed on the user's machine.  That's great, but it broke "pickProcess" on mac/linux when debugging C# projects.

[33mcommit 0d05ca48765da0d7cd55b2d46b49ab90d36a476a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Mar 7 14:05:52 2018 -0800

    Add telemetry to a few more places (#256)
    
    Added telemetry to the following:
    1. activate method
    1. validateFunctionRuntime
    1. timeout to pickProcess

[33mcommit 86053f012e09fe089c37130023f0e6b66b91a7e3[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Mar 2 15:22:50 2018 -0800

    Allow runtime in createNewProject api (#252)

[33mcommit f0b6cbf440a2f935912358f8b005422f92017149[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Mar 2 15:22:18 2018 -0800

    Allow zipIgnore pattern to be an array (#253)

[33mcommit 3d6f41eefd8b293ecfad0fab297724853678e40e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Mar 2 15:21:35 2018 -0800

    Prep for 0.7.0 (#258)

[33mcommit f83e6c72ad8f0ae01605a1b46e367634fdc55756[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Mar 2 15:21:03 2018 -0800

    Activate extension if workspace contains function files (#257)

[33mcommit 9487d9d86f49ab086dea29a035e06c5a8722854f[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Fri Mar 2 12:47:46 2018 +0800

    Add remote debug docs (#255)

[33mcommit 90114eea83feadb67a8b028a26288d3a2df72010[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Fri Mar 2 12:37:55 2018 +0800

    Add description for remote debug in readme (#254)

[33mcommit bb1911e3938270f186c1547fe88f2169afd159a9[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Mar 1 15:00:40 2018 -0800

    Leverage refactored telemetry (#248)
    
    This lets us use `callWithTelemetryAndErrorHandling` for validating projects. I also added the validateProjects command to run with the onDidChangeWorkspaceFolders event

[33mcommit c312f99c5c65bff564330b121a6915e42a2442f1[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Mar 1 14:33:02 2018 -0800

    Add pickProcessTimeout setting (#250)

[33mcommit 6bf50008960306ad0db5eac1dd2e0128b7280625[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Mar 1 11:13:46 2018 -0800

    Improve support for projects created outside of VS Code (#246)
    
    On extension activation, we will check for unitialized functions projects based on the following criteria:
    1. host.json and local.settings.json exist
    1. projectLanguage and projectRuntime are not set
    
    We will then initialize the project in the following manner:
    1. If we can _uniquely_ detect the language - use that. If we can't, prompt the user for the langauge
    1. If we can detect the installed runtime - use that. Otherwise, prompt the user for the runtime
    1. Remove '.vscode' from the gitignore if applicable
    
    NOTE: I also added a command so that user's can call this from the command palette if they so desire

[33mcommit 4144268c2ef725bcfbd9ff7b2f28ed99768f0e20[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Feb 26 13:33:49 2018 -0800

    Allow users to overwrite existing C# project files (#245)

[33mcommit f47f5d4771061b147e418d273865bcc86a04323d[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Feb 26 13:15:31 2018 -0800

    View and delete proxies (#244)

[33mcommit d8fd84a524f0ddb64f9928b9dca8b5fb6fd9cb0f[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Tue Feb 27 03:35:33 2018 +0800

    Enable remote debug for java function (#222)

[33mcommit 2df74f7df40c66cc0e59c508ac3ba9c4398757e8[m
Author: Nathan <naturins@microsoft.com>
Date:   Fri Feb 23 17:08:45 2018 -0800

    Update for GitHub Integration (#231)

[33mcommit 7e8ea219d8ae4e1ab26c0623294c20566207d676[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Feb 23 16:09:12 2018 -0800

    Change 'Create function api' to accept object for function settings (#242)
    
    This is better in a few ways:
    1. It eliminates the need for the settings to always be in the same order
    1. It allows us to add optional parameters in the future in a backwards compatible format

[33mcommit c67b57301b6a2a16a1ca0ddc0dc0d5ae554db411[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Feb 23 10:17:36 2018 -0800

    Remove '.vscode' folder from default gitignore
    
    We add a gitignore to each new project and we originally copied this from what 'func init' put down. However, we definitely want users to commit their vscode workspace settings, launch config, etc.

[33mcommit 6f676c5c4ef2a10502246d045181c03bb1c35eff[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Feb 22 14:07:45 2018 -0800

    Get templateData in a more efficient manner
    
    By only trying the cache/backup if the portal fails

[33mcommit 0e3d36b9d015ae6dc88de787f0fbda22fcb775eb[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Feb 22 12:12:41 2018 -0800

    Ship backup versions of templates with vsix (#237)
    
    And improve unit testing/telemetry around template data

[33mcommit 197553922339fdabefebe78e319faa1ba8df86fc[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Feb 20 16:53:36 2018 +0000

    Update versions of common packages (#233)
    
    There are several benefits here:
    1. Refreshing a node's label doesn't collapse a node anymore
    1. id field is now optional and mostly handled for us
    1. We can leverage tree.findNode()
    1. We can add an 'openInPortal' action to the subscription

[33mcommit db6f9c48367324db59f719b651d122eb93568896[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Feb 16 21:24:07 2018 +0000

    Update appservice package version to fix log streaming (#232)

[33mcommit 1ab083dac090ca3b13fd751789793ea0ca8d65c7[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Feb 16 00:24:54 2018 +0000

    Validate dotnet before installing/uninstalling templates (#230)
    
    Since the user can call 'Install' or 'Uninstall' straight from the command palette, we should always perform the validation.

[33mcommit d4bf0ec29f06c65291ba8ab852d43f0274a94fd3[m[33m ([m[1;33mtag: v0.6.0[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Feb 13 00:39:28 2018 +0000

    Prep for 0.6.0 (#221)

[33mcommit 3182325a9e8db1f2065b50a1e7adf1687937713f[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Feb 13 00:03:43 2018 +0000

    Update functions sdk reference so that C# works on all OS's (#220)
    
    And bump the functions templates versions to the latest

[33mcommit a4dec1e525cb8547fa65068ccf5f6099d250d823[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Feb 12 23:58:03 2018 +0000

     Improve error handling for child processes (#211)

[33mcommit 39a2eade8475c5065c40533c32a1a12a53c60b65[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Sat Feb 10 07:24:42 2018 +0800

    add maven prerequisite description (#216)

[33mcommit 8b8d315110dc7c23ae1f0af4a4b503dc3ee04f99[m
Author: Matt Hernandez <maherna@microsoft.com>
Date:   Fri Feb 9 08:26:07 2018 -0800

    Add link to Functions deployment tutorial. (#217)
    
    Added a link to the new Azure Functions deployment tutorial in the VS
    Code docs.

[33mcommit a7fca0467a725ea6590a6b1ddb71c243177a0ea5[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Feb 9 16:25:41 2018 +0000

    Make warnings consistent (#212)
    
    For the 64 bit warning, it now opens the link directly with a 'See more info' instead of having to copy the link. There's also a 'Don't warn again' option

[33mcommit 228d70e6e0f6b5c896c7a67c91f4ad85ed401b30[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Fri Feb 9 00:20:17 2018 +0800

    check function runtime version at extension activation (#204)

[33mcommit dee40a83edad8a96f3909fbd80111dcd6e0b1927[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Feb 7 21:55:45 2018 +0000

    Support Function projects in multi-root workspaces (#210)
    
    Our project settings were being completely ignored in multi-root workspaces. Here's what I did to fix that:
    1. Declare our project-based settings as 'resource' scope (If you use the default scope of 'window', then settings only apply at the user/workspace level - not the workspaceFolder level)
    1. Pass the projectPath in when getting settings so that the specific folder takes precedent
    1. Modify the workspace folder picker so that it dynamically gets the subpath for each folder
    1. Fix 'update' for mutli-root settings: If you don't pass the ConfiguratonTarget, it uses the appropriate scope from the configuration (Workspace vs WorkspaceFolder)

[33mcommit 7b284ad4c9e743f5caabc5fd28995d989c15ac7e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Feb 7 10:11:03 2018 -0800

    Fix multiple prompts if language not set
    
    This is what currently happens if you try to create a function without a language/runtime set:
    1. Language is an empty string, but user isn't prompted to set it
    1. Runtime is an empty string, and user _is_ prompted
    1. We try to find the templates matching the user's settings, but we can't find any so we prompt them for all three values again (language, runtime, and filter)
    
    Instead, we should prompt them in step 1 & 2 and then we don't have to prompt for step 3. (Step 3 is only meant to happen if the user changes their settings to something like 'Python', 'beta', and 'Verified' - which has no templates)

[33mcommit 04a1dabcd6ab0b14b1a2196fdd1374e487ffbc09[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Feb 6 19:47:12 2018 +0000

    Add log streaming (#207)

[33mcommit f45ce3c339117adf0e7b22ddac867b99ea6d0845[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Feb 5 08:58:13 2018 -0800

    Add docs for installing 64-bit version of func cli

[33mcommit 9878d05302edbb99e5154dac6014ca0935c232c6[m[33m ([m[1;33mtag: v0.5.1[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Feb 2 09:31:42 2018 -0800

    Use akams link instead of direct link
    
    That way we can change the link (to better docs, etc.) without having to re-publish

[33mcommit aecf8b4d6c2783f4af4edf5eca304bc7ce94ce1c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Feb 1 23:19:06 2018 +0000

    Fix C# debugging for v1 (.NET Framework) (#199)
    
    1. The type for the launch.json should be 'clr' instead of 'coreclr'
    1. We have to show a warning about attaching to 64 bit processes
    1. Allow for func.exe possibly being renamed to func64.exe
    1. The regex for the process was wrong. Specifically, we want to match these two strings (v1 and v2 of the runtime)
    ```
    emjdev3,C:\Users\erijiz\AppData\Roaming\npm\node_modules\azure-functions-core-tools\bin/func.exe host start,func.exe,10608
    emjdev3,dotnet C:\Users\erijiz\AppData\Roaming\npm\node_modules\azure-functions-core-tools\bin/Azure.Functions.Cli.dll host start,dotnet.exe,10528
    ```
    
    But we don't want to match these (other languages than C#):
    ```
    emjdev3,C:\WINDOWS\System32\WindowsPowerShell\v1.0\powershell.exe -Command func host start,powershell.exe,10020
    emjdev3,C:\WINDOWS\system32\cmd.exe /c ""C:\Users\erijiz\AppData\Roaming\npm\func.cmd" host start",cmd.exe,3664
    emjdev3,node   "C:\Users\erijiz\AppData\Roaming\npm\\node_modules\azure-functions-core-tools\lib\main.js" host start,node.exe,8700
    ```

[33mcommit b776cc4bf296d08433258866d00172e370e77903[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Feb 1 00:42:34 2018 +0000

    Update prereqs section of README (#198)
    
    * Include more detail about v1.0 vs v2.0
    * Explain how to uninstall/reinstall C# templates
    * Move language specific sections down the page
    * dotnet cli -> .NET CLI

[33mcommit 22bf5eb0383daa4106e77bf521a6b5d803b6204e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jan 31 22:35:07 2018 +0000

    Improve C# F5 experience (#196)
    
    1. Switch away from ps-node on windows because it is very slow
    1. Stop and restart the functions host if it is running when the user starts debugging
    1. Only build once when the user F5's instead of twice

[33mcommit 62afb5b4608f46bc701593f3395ec150be2ff1f4[m
Author: Jay Wang <jiewan@microsoft.com>
Date:   Wed Jan 31 11:29:09 2018 -0800

    Add build/release badges to README (#197)

[33mcommit 56e8197f4869ce4b973f5db7328483579a777b0c[m[33m ([m[1;33mtag: v0.5.0[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Jan 25 16:24:19 2018 -0800

    Doc updates

[33mcommit 4d6b38cc327859f2f4acbd39abc5c16fb07426e5[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Jan 25 16:15:32 2018 -0800

    Rename attach task for c#
    
    (Since it could be .NET Framework instead of .NET Core)

[33mcommit 34d248f60b8ddf9f47ea27aa72e893fecf161567[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Jan 25 16:05:54 2018 -0800

    Add more logging
    
    1. How to uninstall/reinstall templates
    1. Show that we're searching for the func process on F5 (since it can take a while)

[33mcommit 68d6f15e62e372c8683f43e9366017d8447cde35[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jan 24 15:05:23 2018 -0800

    Prep for 0.5.0

[33mcommit afbf0e7a67b1bafea1cd584dc50a21ec5a4ae0d0[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jan 24 13:24:29 2018 -0800

    subPath -> subpath

[33mcommit d236d8c5196b14461a778fa465db2073bab91e9e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jan 24 13:18:02 2018 -0800

    Improve C# template installation
    
    1. Allow windows users to install either the .NET Core _or_ .NET Framework templates
    1. Provide commands to install/uninstall the templates
    1. Limit function templates to just the main 4
    1. Detect if the project created was .NET Core or .NET Framework and set runtime accordingly

[33mcommit d6c137bad5622882636a5f0417acd8166c5c89dc[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jan 24 13:19:33 2018 -0800

    Fix C# blob trigger path (#178)

[33mcommit fcfaceec9b5a64300a5c3aec6cfb226a46f82c89[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jan 24 13:19:10 2018 -0800

    Only use global settings when creating a new project (#177)
    
    Since a project is basically a new 'workspace', it doesn't make sense to use settings from the 'previous' workspace. Instead, only respect global settings.

[33mcommit d61db5d4ad0ca7735bbadec30d6e1e7504321fd5[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jan 23 10:47:23 2018 -0800

    Add local debug support for C# Scripts

[33mcommit 283d77109b6ad89b0ec21d9ea52d7674359127a8[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jan 23 09:22:29 2018 -0800

    Add preview support for several script languages

[33mcommit a76a321edb56f2106b4535b871304a086dfb4f2a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Jan 18 15:41:35 2018 -0800

    Add deploy support for C# class libraries

[33mcommit 00941569ca93abc6cded8eb9ca862de7f6305812[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Jan 19 16:15:14 2018 -0800

    C# functions - prompt for namespace

[33mcommit 3d7cf5f75fdbdd007bbd2b2a062fd29a8a5ad965[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Jan 18 14:43:48 2018 -0800

    Add createFunctionApp to api (#172)

[33mcommit 198a3486be1abae9cebab37fdb9e4e091d38a7cd[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jan 17 16:07:06 2018 -0800

    Fix function.json parsing for C# functions
    
    They don't require the direction information

[33mcommit 767808b70bd2d04625cf57883c165a23b9215441[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jan 17 09:02:37 2018 -0800

    Increase timeout for a few tests

[33mcommit b8516f32d2c73aeb4a708f3fcb0a8dc28e1cc284[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jan 16 16:20:58 2018 -0800

    Automatically start the functions host when F5ing C# projects
    
    And remove the problemMatcher since it's not used for C# projects

[33mcommit 3d42f2ab35b9c244b69979d7dafa6904a1de0b90[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jan 17 09:16:23 2018 -0800

    Default ignoreFocusOut to true

[33mcommit 7fe28b5a79eecdc374f55289337d8d3d907e35ea[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Jan 11 17:37:52 2018 -0800

    Add support for C# Class library projects (#161)
    
    This supports project/function creation and local debugging. It does not include deploy logic.
    
    A brief summary:
    1. We default C# projects to beta runtime and class library (instead of C# script)
    1. We use dotnet templates for project/function creation. We will automatically install the templates for the user if they are not on their machine (I don't prompt at all - let me know if you think we should prompt).
    1. We use the parameter information from the functions portal (Aka C# Script templates) since it's easier to parse than the dotnet cli and it gives us more information (like validation). This requires us to assume that parameters for C# Scripts are the same as the parameters for the C# Class libraries. Since that might not always be the case, I mitigated this with unit tests and hard-coding the version of the dotnet templates.
    1. Unlike JavaScript debugging, we have to attach to a specific process instead of attaching with a port. I implemented a 'pickProcess' command to search for the functions host process.
    1. This only works on Windows. There's a few issues on a Mac I still need to iron out.

[33mcommit a6f0af8e04c60f2b9d594f5efecb46b885a411ec[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Jan 11 11:07:59 2018 -0800

    Move test to gulp instead of npm

[33mcommit 09f45e014f8cc104b9dd5a2895c504ff66ac6fa0[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jan 9 16:18:19 2018 -0800

    Install azure account extension for tests

[33mcommit 4af25798c353c9bacf56c517fd62536409685b79[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jan 9 12:42:29 2018 -0800

    Allow programatic use of deploy, createFunction, and createNewProject

[33mcommit 32b2fb8317673d40921df5c8e60ffd6c0a8732dc[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Jan 5 10:28:25 2018 -0800

    Refresh app's state when the node is refreshed

[33mcommit bf2b67589c86626f9e938a30f598ee98f461b074[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Jan 4 15:06:57 2018 -0800

    Leverage shared AzureActionHandler (#150)

[33mcommit 62842d7fc03574c820564773f608416877ebe30b[m
Author: chrisdias <cdias@microsoft.com>
Date:   Thu Jan 4 14:21:49 2018 -0800

    fixes #151

[33mcommit b3154f8ba2f1bec6d65d2f33cfe86d6d35c713b9[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Jan 3 09:58:06 2018 -0800

    Move browse to the bottom of the list of folders

[33mcommit 5c0332b814b6abe0d5bef6a5a476b6bcb98d4a64[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Wed Jan 3 11:56:44 2018 +0800

    refactor function creator

[33mcommit f44e6f7ece80ee12189baa693267619ceba8a482[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Jan 2 10:48:10 2018 -0800

    Force refresh functions node on deploy

[33mcommit a8a8276378cdb439a112eef729d386ca9bb12cf3[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Dec 21 14:21:43 2017 -0800

    Split function/project creation into separate files
    
    This helps isolate language-specific code and will be more important as we add C# class library support. It should have no functional effect.

[33mcommit d5433158d5651734a8223a83aa489e1138c73960[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Dec 21 13:54:54 2017 -0800

    Move create function and create project to subfolders

[33mcommit 7cb3ecba39a92e837b337432811814812bb8a62d[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Mon Dec 18 11:49:21 2017 -0800

    Stop app before Java deploy (#138)
    
    To avoid *.jar file being locked

[33mcommit e91435f34476dd95ab9e0266f981d4806b62f813[m[33m ([m[1;33mtag: v0.4.0[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Dec 14 16:49:09 2017 -0800

    Prep for 0.4.0 release

[33mcommit c5a36078b9c037939d0d24b89e0417021f7f5f0a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Dec 14 16:05:48 2017 -0800

    Show http trigger urls in deploy log

[33mcommit fdd1329623b9b8e3e55a191235573cdfb46df7a3[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Dec 14 11:22:10 2017 -0800

    Add note about debugggable languages to language setting

[33mcommit c0c0503e6534bb41487697b16630d886ecc9c45b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Dec 13 15:38:16 2017 -0800

    Remove C# script file support
    
    Turns out we want to add support for class libraries (.cs), but this code added support for C# script files (.csx). I want to leave this code in the git history in case we add support for .csx _in addition_ to .cs

[33mcommit 8c894060b8605774547c4797b9d9e50096010229[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Dec 13 14:43:17 2017 -0800

    Add support for other languages/runtimes
    
    * Add CSharp to the list of options when creating a new project
    * Add setting for projectLanguage
      * The user has many options for language, but only C#/Java/JavaScript can be debugged in VS Code today. The rest only support create & deploy
      * If it's not set (for example in old projects before this release), the user will be prompted one time and their workspace setting will be updated
    * Add setting for projectRuntime
      * We want to use ~1 for JavaScript and beta as the default for Java/C#

[33mcommit 1215930b67f6770458bcef6d9913c411995f39ca[m
Merge: 34e0357 d529110
Author: Jay Wang <jiewan@microsoft.com>
Date:   Wed Dec 13 14:47:33 2017 -0800

    Settings for Zip glob patterns

[33mcommit d52911031d5a6dd1afffd28d89eb18601dfdefbb[m
Author: REDMOND\jiewan <jiewan@microsoft.com>
Date:   Wed Dec 13 13:52:19 2017 -0800

    Update app service package version

[33mcommit 81119b7a87c2e5e782b42d7268fc352afc3821a0[m
Author: REDMOND\jiewan <jiewan@microsoft.com>
Date:   Tue Dec 12 15:53:57 2017 -0800

    Settings for Zip glob patterns.

[33mcommit 34e03574739cd19ce3ade422d560b97cfd4d96bf[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Dec 11 17:27:21 2017 -0800

    Add 'Copy function url' command
    
    And make the parsing of 'function.json' more robust

[33mcommit 676753cb62cb9dccc51553cb031bf71021f903a9[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Dec 11 11:30:49 2017 -0800

    Leverage auto-detect of deployment source for deploy
    
    * This adds support for local git
    * I also added the 'Change Deployment Source' command since it's kind of necessary to make this useful

[33mcommit d9322b0db56addac962b29f809b33a7c772dbf8f[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Dec 8 16:18:32 2017 -0800

    Add templateFilter to telemetry

[33mcommit 046c4054bbadb62fdf660e3e67b803e141b13a56[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Dec 8 17:20:41 2017 -0800

    Don't ignore the cancel button
    
    Turns out it returns 'DialogResponses.cancel' instead of undefined

[33mcommit dbf40e41e3f3f1234ba8e2b797a80d071f8ddd8d[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Dec 7 15:50:44 2017 -0800

    Show in-between states for stop/start (#122)

[33mcommit d6809098bd72de39f4110174dada4a913f23e806[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Dec 7 10:46:25 2017 -0800

    Track template id instead of template name

[33mcommit 30c351906b7fd6ae41dcdad4848d3dcba8a7a8bc[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Dec 6 10:28:05 2017 -0800

    Fix templates not being displayed
    
    Use template.id (which shouldn't change) to detect for equality rather than template.metadata.name (which can and has changed)

[33mcommit 4e81f145574f643794cdda9aa20ac2b115987015[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Dec 4 23:32:20 2017 +0000

    Log 'delete function' in output channel (#114)

[33mcommit f33d7c42b47eae4cdf77b9b2528b95b877ff3cc1[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Dec 4 11:54:59 2017 -0800

    Add project type telemetry to deploy

[33mcommit 942d39505f47b91aacb53c0ed36d05dce355c8eb[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Mon Dec 4 08:52:49 2017 +0800

    remove duplicated code about checking the existance of maven

[33mcommit 93e6c0806fae65b7d2e0966977d1248049000a3d[m[33m ([m[1;33mtag: v0.3.0[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Dec 1 10:35:29 2017 -0800

    Add back prereq for .net core 2.0

[33mcommit 08d3cc09d56f014b48cd193018622abc03fef6f7[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Fri Dec 1 08:30:02 2017 +0800

    check maven is installed or not

[33mcommit a59dcc1c4f8ccd8315fef465dabda387f7d630e8[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Fri Dec 1 17:23:59 2017 +0800

    add function name validator and fix some issue

[33mcommit b79bd11a8bfcd00fc42b94f9b72cd237163fb135[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Nov 30 14:05:28 2017 -0800

    Prep for 0.3.0 release

[33mcommit 5d8cf0d749a061b135c8d0fcf0231c9d3bbf5cac[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Thu Nov 30 19:39:06 2017 +0800

    refactor java name validation

[33mcommit 8707812df8d8f32f5239cc2c219d0b1bbd416d30[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 29 22:39:22 2017 +0000

    Send telemetry event with new project/function details (#89)

[33mcommit 2cfe50150e3e89467f11dbb0566925128d21ee9d[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 29 20:55:48 2017 +0000

    Add function and app setting tree items (#87)
    
    Also pass along showCreatingNode for new function app

[33mcommit 7e593c251d94b9d0cd5ac092a475d13248780bd7[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Nov 28 09:08:19 2017 -0800

    Remove note about Node <8.0
    
    8.0 is LTS now and thus we don't need to support less than 8. (Plus users still have a workaround)

[33mcommit 84f3da5a76a52ba6a6860d0590082817d33f6c48[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Thu Nov 30 01:07:02 2017 +0800

    Add new java function (#80)

[33mcommit 89b70a28996f5d01cb8f86342bd781f847a5fd9d[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Wed Nov 29 00:34:09 2017 +0800

    Remove extra folder on 'New Java Project' (#79)

[33mcommit a72cce4233489a6990b4c5d1b31c25395d57cd54[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Wed Nov 29 00:24:25 2017 +0800

    Automatically detect functionAppName on java deploy (#75)

[33mcommit 3d5893b9af5a383eba8e45e27ed4ac4e3c6a0a08[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Nov 21 14:59:52 2017 -0800

    Update ui package to 0.2.0
    
    And lock down minor version (Since the package is in preview - minor version updates might mean breaking contract changes)

[33mcommit abe2bdd085d5ac99c973c7ed1722545640c7577e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Nov 21 13:51:51 2017 -0800

    Use 'cancel' instead of 'close'

[33mcommit f7ce496354b7a761a4d7aaf68dce64f221499bdf[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Nov 21 11:59:51 2017 -0800

    Add vscodeignore

[33mcommit 89bc6dd5f18156ab95ee4b09f170c4bd7052029a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Nov 17 10:04:32 2017 -0800

    Leverage AzureTreeDataProvider from shared package
    
    It reduces the amount of copied code and adds support for 'load more'

[33mcommit 2cb75ad2c3f4fdf926ce646c328afb7aba546824[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Sat Nov 18 01:56:42 2017 +0800

    Add support for java function deploy (#70)

[33mcommit 28b06208b30c1369f18c0ee1c7a6bb2ed1c00b08[m
Author: Sheng Chen <sheche@microsoft.com>
Date:   Thu Nov 16 07:15:08 2017 +0800

    Support create java function project (#66)
    
    This leverages [maven archetype](https://github.com/Microsoft/azure-maven-archetypes/tree/master/azure-functions-archetype).

[33mcommit bb90c278ba64b82ee6dfb89542d8b4658f2a2289[m[33m ([m[1;33mtag: v0.2.0[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Nov 9 19:02:19 2017 -0800

    Update gifs based on latest UI

[33mcommit 8cdb675b08542b76290f03552cd6d17510561506[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Nov 10 00:26:18 2017 +0000

    Remove reliance on func cli for 'Create new project' (#63)
    
    Benefits:
    1. User can now create project and function without func cli (they only need the cli for debugging)
    1. We can now prompt the user to overwrite existing files
    1. We can automatically detect if we should git init the folder

[33mcommit 8239b0be9332a6c6ac9690725ef0850ed2bd639a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 8 19:24:53 2017 -0800

    Add 'Delete Function App' command

[33mcommit 7620055d2b80c6d28543fc9b3104e7be659c509b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Nov 9 20:21:36 2017 +0000

    Add 'Create Function App' to node picker (#60)
    
    Also:
    1. Remove deploy from function app node
    1. Use latest instead of ~2 for templates version

[33mcommit 5e4cbcb8d6875b348e86f0e522e8960c6935a63d[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Nov 9 10:21:45 2017 -0800

    Prep for 0.2.0 release

[33mcommit 698c223b2f1e95934c0ebbf13f93bbd8c1d72b6b[m
Author: Chris Dias <cdias@microsoft.com>
Date:   Thu Nov 9 08:18:38 2017 -0800

    Fix request-promise compile error (#59)

[33mcommit dae8457838dbbe6fee2e0dcfd5f7f9612bb895b8[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Nov 7 19:40:59 2017 -0800

    Refactor deploy entry points and add 'Create Function App'
    
    1. Moved deploy to the explorer menu bar instead of right click menu on function app
    1. Removed 'zip' wording
    1. Only added 'Create Function App' to subscription and command palette for now

[33mcommit dcd2f01623f87d2e75bd2e012f63180a3c083c26[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Nov 7 17:57:54 2017 -0800

    Don't continue creating function if user cancels

[33mcommit a1f82b5c08f72ecbf40335d4702d0fc0068e68d4[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Nov 6 10:51:10 2017 -0800

    Refactor function template resource prompt
    
    1. Prompt with existing App Settings before listing resources
    1. Add support for storage resource type
    1. Validate AzureWebJobsStorage app setting before creating non-HTTP triggers

[33mcommit 225c22c892dcfd3ae8833d6a31517a70bb16a4d4[m
Merge: 6550917 232523f
Author: Jay Wang <jiewan@microsoft.com>
Date:   Sat Nov 4 12:21:07 2017 -0700

    Add 'Azure' to display name in explorer

[33mcommit 232523f7015066a918a24f667690aeee6bc06dcc[m[33m ([m[1;31morigin/chrisdias/explorername[m[33m)[m
Author: Chris Dias <chris@diasfam.com>
Date:   Sat Nov 4 12:13:32 2017 -0700

    add 'Azure' to display name in explorer

[33mcommit 655091729f4657fcf26a35c5de4850f107e758d6[m
Author: Reiley Yang <reyang@microsoft.com>
Date:   Thu Nov 2 17:08:26 2017 -0700

    fix the doc - add TSLint since it's required by the build step (#47)

[33mcommit 1d90f221c7f278e312770de3bcfb6db74568521b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 1 10:23:29 2017 -0700

    Leverage fs-extra instead of defining our own fsUtils
    
    Also:
    1. Use secure random string
    1. Slightly modify newline rules that are being annoying
    1. Remove '--type-check' from lint command since it's deprecated and no longer necessary

[33mcommit faa4feaf242aa0f5bbcb4f03de0debde6dd6ffcc[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Nov 2 15:06:07 2017 -0700

    Merge changes from 0.1.1 patch release

[33mcommit 2690ad8f4951318c7cf5b6be5ca81659c60dec2c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 30 09:59:47 2017 -0700

    Add template filter configuration setting
    
    Some of the templates don't work on the latest func cli when debugging locally. Adding a 'Verified' setting for just the ones that work and an 'All' setting for those adventurous users

[33mcommit a6b803bb0359277b7868ab63e1dbd831e9b3960b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 1 09:38:53 2017 -0700

    Improve display of multiline and azure errors

[33mcommit 55673b2c7c16993e87ad799abdfc1bd22dca2908[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Nov 1 09:19:29 2017 -0700

    Add keywords to package.json

[33mcommit b22c1c470146c7eb1e66c4717ec1fa66c5a0e450[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 30 11:52:44 2017 -0700

    Add support for enum setting in function templates

[33mcommit 38d21f6148ea708895bfc3531812d86be2da8527[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 30 17:02:20 2017 -0700

    Retrieve templates from functions portal instead of cli (#32)
    
    The main benefits:
    1. We get the full list of templates supported in the portal
    1. We can prompt the user for input parameters
    1. We reduce reliance on the func cli
    
    I also refactored uiUtil into an interface so that I could more easily create unit tests

[33mcommit 2223cbf25a43d9a79b85420e44c971bf0a998254[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Oct 26 10:32:05 2017 -0700

    Use color icons from the portal

[33mcommit 4ce2117d211c8228071cd0a54931fa93c3ca5eca[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 24 10:49:44 2017 -0700

    Fix OpenInPortal from command palette

[33mcommit 343026f1f591e224eb902279fe47a4055197ab08[m[33m ([m[1;33mtag: v0.1.0[m[33m)[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Oct 19 15:15:28 2017 -0700

    Fix restart to be in correct order

[33mcommit 647232ffc30af9616095dbbb4efe160b4196c016[m
Merge: 481c9b3 b167fc1
Author: Stephen Weatherford <StephenWeatherford@users.noreply.github.com>
Date:   Wed Oct 18 17:47:50 2017 -0700

    Merge pull request #23 from Microsoft/dev/f5error
    
    Show task output when F5'ing, fixes #16

[33mcommit b167fc1d5f72fcf95bfc9e3a8327d2631e66ef2f[m
Author: Stephen Weatherford <stephwe@microsoft.com>
Date:   Wed Oct 18 17:14:44 2017 -0700

    Show task output when F5'ing, fixes #16

[33mcommit 481c9b3c633f9e0d019f9f97f2ff03c4d7d92ebe[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Oct 18 13:39:04 2017 -0700

    Modify entry points for zip deploy
    
    1. Add 'right click on folder' entry point
    1. Add context-specific wording for each entry point
    1. Make folder selection consistent across all commands

[33mcommit bca11a4795475cad71f148d63030dcd238c6c0b7[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 17 10:53:22 2017 -0700

    Refactor util into unique files

[33mcommit 0df201973c30d93d50142d6641649ef75ae18827[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Oct 18 13:35:10 2017 -0700

    Clean up repo for first release
    
    1. Update gifs and feature list to include zip deploy
    1. Rename 'Create Function App' to 'Create New Project' to differentiate it from creating the Azure Resource
    1. Update telemetry note in README to include privacy notice and be more generic

[33mcommit 9f8f13d67377da7eeabdc584467dbb4f51dbad2e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 17 15:36:53 2017 -0700

    Remove archiver from dependencies
    
    It's never used and I don't want to add it to thirdpartynotices

[33mcommit cb01d5afa1d3dbc67e84d10990dcfaaac56d0e5b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Oct 17 08:52:05 2017 -0700

    Add zip deploy
    
    This leverages the shared package

[33mcommit 111f9e6e1b112a212baa512576f0966fc3fa29d8[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Oct 12 13:51:13 2017 -0700

    Refactor error handling and add unit tests for the first time

[33mcommit 6aefe1fd7afb067769e08483328a16e91e30b727[m
Merge: 9d3ad5d 12261d2
Author: Stephen Weatherford <StephenWeatherford@users.noreply.github.com>
Date:   Thu Oct 12 12:06:12 2017 -0700

    Merge pull request #14 from Microsoft/dev/stephwe/linebreak
    
    Turn off linebreak-style for crossplatform work

[33mcommit 12261d2d290401b01937c771d31c3c971939d97b[m
Author: Stephen Weatherford <stephwe@microsoft.com>
Date:   Thu Oct 12 12:02:44 2017 -0700

    Turn off linebreak-style for crossplatform work

[33mcommit 9d3ad5d9f056ec67e02638880254837cfff456e1[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Oct 4 09:52:07 2017 -0700

    Allow user to hide explorer

[33mcommit a437869c54ad4b082addb9ad8591c4a62cd1baab[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Oct 4 08:50:03 2017 -0700

    Fix reference to cosmos db in readme

[33mcommit 213de865c95cda7b7412cfd2e832ef93e517e16a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 13:15:18 2017 -0700

    Show error messages for commands
    
    VSCode doesn't always display errors. Rather than rely on their implementation, we should just always show the errors ourselves.

[33mcommit 563943df36837cf893f879fb203b29f26c72f85e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:32:53 2017 -0700

    Make strings localizable

[33mcommit 05e0fbeaed04d1af1432528bffe888c2dac74bac[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:08:42 2017 -0700

    Add more tsconfig checks

[33mcommit 9ee1fa38bf0f44c52fd0ad62a707ecc0a0b146e6[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:08:37 2017 -0700

    Refactor common node functionality
    
    - Move repeated code (like getIconPath) into NodeBase
    - Implement showNodePicker so that commands work from the command pallete
    - Move start/stop/restart logic into command files and show function app state in explorer instead of output window

[33mcommit 2b5d429360998a8bce87b73c09777166782c1173[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:08:30 2017 -0700

    Rename INode and QuickPickItem

[33mcommit c089fd258c1935429551a81dc9babb75d8767de5[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:08:24 2017 -0700

    Rename node icons to match contextValue

[33mcommit 0a10dfa31c04387f69e6ab23dd53e4beab984c3f[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:08:20 2017 -0700

    Add tslint to CI

[33mcommit 14a37387dddd6ecb40dce4d90804d1bbc7f9caf5[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:08:14 2017 -0700

    Refactor nodes and commands into separate files

[33mcommit 182b578df1adb796d166abe0ed0ac34a70dda67c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:08:09 2017 -0700

    Fix tslint type check errors

[33mcommit dc475a605f01b655545989a1f206a8d8ea22e343[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:08:03 2017 -0700

    Add tslint type checking

[33mcommit 2b28c5ef4f42bbfe790e383bb7c455a9c1318b1a[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:07:55 2017 -0700

    Fix or ignore tslint import errors

[33mcommit 0382f11412f209b80bf97423cedf5e83e4524112[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:07:50 2017 -0700

    Rename explorer.ts to match class name

[33mcommit 66daa7dae348103815a2cb04594b8d438fee67cd[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:07:43 2017 -0700

    Remove non-null assertions and refactor errors

[33mcommit 084b4ade1900f13e1b41f1896bd17ef0bd9ee8b0[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:07:37 2017 -0700

    Add missing type definitions

[33mcommit 2579a96a7ffb02695791f86478a2e9feb24cee57[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:07:32 2017 -0700

    Fix tslint variable-name and no-parameter-properties

[33mcommit 36683ee551b6b089e22a1244c6851de212a5e711[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:07:28 2017 -0700

    Auto-fix all possible tslint issues

[33mcommit 3ed5ac714af7f78548058ba48c9e0a52c943683e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:07:24 2017 -0700

    Add tslint
    
    And remove TODO's that are already covered by issues in the repo

[33mcommit 7bdd6daa40fa2d687c5328f3ce920021c4c602ed[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:07:16 2017 -0700

    Refactor QuickPick to include type without data

[33mcommit 1304997de15f442870545ea36139cfe8ca8c0dea[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Mon Oct 2 09:07:02 2017 -0700

    Refactor stateless classes into modules

[33mcommit 647685a5f2d278502b8d0b260dd959c8065bc761[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Sep 29 16:02:02 2017 -0700

    Incorporate update to showOpenDialog API

[33mcommit dd18766c849212d889f8364df324ccd95089fb61[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 27 16:22:48 2017 -0700

    Add link to issue

[33mcommit 6a9ace5024ecf252c4a0c26e02375238a128d48e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 27 16:20:31 2017 -0700

    Add features and prerequisites to README

[33mcommit 7b2ddc7b9cf7743023ece9c0448ef7be86652d2c[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 27 13:40:21 2017 -0700

    Fix nested promise as return

[33mcommit 73389b366829caa8469b55c89e73d2b09a5a8fb4[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 27 11:26:33 2017 -0700

    Fix running func cli on Windows

[33mcommit 8a939800142f4b50a6a26bbf41ef8dc6814ced8b[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 27 10:45:48 2017 -0700

    Add json validation for function files

[33mcommit 6bbb6c86108393bdd08afd0bf7e76c8d33556ca7[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 27 10:29:40 2017 -0700

    Fix fail to attach on first F5
    
    We can create a bogus problem matcher that 'signals' that it's time to attach the debugger

[33mcommit b828b8b29915b46610d685d26216ebd40d2abe76[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 27 09:31:25 2017 -0700

    Add functions logo

[33mcommit c1cd215a9f7e4604f0c7d1f053608470a6d47285[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Wed Sep 27 08:35:00 2017 -0700

    Modify new function commands to work with multiple-root workspaces

[33mcommit 58935bc0b6458a54a7592e4d3b6f99f07a6896d6[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 26 17:01:57 2017 -0700

    Rename initFunctionApp to createFunctionApp

[33mcommit 9604c40be1f04f885839436956e7e04642d1d47e[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 26 16:57:14 2017 -0700

    Open new function app after it's created

[33mcommit 789943edaa25d3f8af4e20755b0722bb978fed31[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 26 15:34:27 2017 -0700

    Add identifier to launch task

[33mcommit 05bb432a518940f1344d0f38892ffdbcf75bb7bc[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 26 14:12:17 2017 -0700

    Update repo properties for formatting

[33mcommit 7e8ac41aec555dda24a26870372ecaad31d79a05[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 26 10:56:53 2017 -0700

    Run 'func host start' as background task

[33mcommit 556fb6ec8ee5d9f252900007f31350ed165e40f3[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Tue Sep 26 09:33:30 2017 -0700

    Remove EventGridTrigger
    
    This isn't being shown in the CLI anymore

[33mcommit dd9af221ba4e2d37a7c0741f3e440452493a96cb[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Sun Sep 24 15:09:03 2017 -0700

    Run 'func host start' as a preLaunchTask
    
    So that the user doesn't have to run it manually and then attach

[33mcommit b7b646a14d7d42eeb73b8a8fd28bbf871ef3b2fd[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Sat Sep 23 15:57:49 2017 -0700

    Fix empty error being reported for child process
    
    Sometimes stderr gets empty strings. Now we will wait for the program to exit and display all stderr if it's not empty

[33mcommit 20d5c107ab52249f0ead61064981070bcf8e9f06[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Sat Sep 23 15:57:20 2017 -0700

    Open new file after creation

[33mcommit 321f8c0710161c4818072c41b3fc550602045f51[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Sat Sep 23 15:15:07 2017 -0700

    Handle special characters from user input for child processes

[33mcommit f0c86bcd6b82b18c1d304f9e9cc1a80ebafe2b7f[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Sat Sep 23 14:13:14 2017 -0700

    Improve error handling for functions cli
    
    We don't get an 'error' if a command fails, but we can throw the stderr

[33mcommit 2ab02654b7ab6dee3c722125a2740b5c63be41a8[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Sat Sep 23 12:50:04 2017 -0700

    Use child process instead of integrated terminal
    
    This lets us 'await' the process and parse the ouptut

[33mcommit c35d23614b23aea5c5346f62beb7fdb5e74285d8[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Sat Sep 23 08:34:42 2017 -0700

    Show folder dialog option on func init

[33mcommit 7b17feb67f5ec528d9c01a153f430cd61c7dbc73[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Sep 22 11:44:35 2017 -0700

    Add start/stop/restart commands

[33mcommit 281042513a82ddf68ab7b147006d5662a277aa17[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Fri Sep 22 10:20:39 2017 -0700

    Add validation to init and create commands

[33mcommit 7768e5cbd7c47adf8b0104106350168479c5b112[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 21 17:11:27 2017 -0700

    Update gitignore to ignore output

[33mcommit c86211518e3af4d3878e9aeb62986b9c39976872[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 21 16:21:48 2017 -0700

    Add support for init function app and create function
    
    These are just simple wrappers for the cli at this point

[33mcommit 71a8d1be9a425dc5dddce3eef9b4ea04f5fcfe99[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 21 16:21:02 2017 -0700

    Display Function App nodes in explorer
    
    This includes the basic 'Open In Portal' action

[33mcommit 26543238bad991d135404ab764f43ccaeb6a46be[m
Author: Eric Jizba <erijiz@microsoft.com>
Date:   Thu Sep 21 16:20:07 2017 -0700

    Add functions explorer
    
    Refresh command and display subscriptions

[33mcommit 184eae9b84969dad8b5203a51d736954a151998f[m
Author: Microsoft Open Source <microsoftopensource@users.noreply.github.com>
Date:   Thu Sep 21 14:28:51 2017 -0700

    Initial commit

[33mcommit 8eba2bfafe24cdf675ca59f370ffc32db0ee3daa[m
Author: Microsoft Open Source <microsoftopensource@users.noreply.github.com>
Date:   Thu Sep 21 14:28:51 2017 -0700

    Initial commit

[33mcommit 3c7354a1091b0d3b81dd04b0bc240938bdf36422[m
Author: Microsoft GitHub User <msftgits@microsoft.com>
Date:   Thu Sep 21 14:28:44 2017 -0700

    Initial commit
