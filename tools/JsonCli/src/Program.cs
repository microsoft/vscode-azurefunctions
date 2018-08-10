/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Reflection;
using Microsoft.TemplateEngine.Abstractions;
using Microsoft.TemplateEngine.Cli;
using Microsoft.TemplateEngine.Cli.PostActionProcessors;
using Microsoft.TemplateEngine.Edge;
using Microsoft.TemplateEngine.Edge.Settings;
using Microsoft.TemplateEngine.Edge.Template;
using Microsoft.TemplateEngine.Edge.TemplateUpdates;
using Microsoft.TemplateEngine.Orchestrator.RunnableProjects;
using Microsoft.TemplateEngine.Utils;
using Newtonsoft.Json.Linq;

namespace Microsoft.TemplateEngine.JsonCli
{
    internal class Program
    {
        private static IHostSpecificDataLoader _hostDataLoader;
        private static TemplateCreator _templateCreator;
        private static SettingsLoader _settingsLoader;
        private static Paths _paths;
        private const string DefaultLanguage = "C#";
        private const string HostName = "AzureFunctions-VSCodeExtension";
        private const string HostVersion = "1.0.0";

        public static EngineEnvironmentSettings EnvironmentSettings { get; private set; }

        private static int Main(string[] args)
        {
            string profileDir = GetHomeDirectory();
            string hivePath = Path.Combine(profileDir, ".templateengine", HostName, HostVersion);

            ITemplateEngineHost host = CreateHost(HostName, HostVersion);
            EnvironmentSettings = new EngineEnvironmentSettings(host, x => new SettingsLoader(x), hivePath);
            EnvironmentSettings.SettingsLoader.Components.OfType<IIdentifiedComponent>().ToList();
            _paths = new Paths(EnvironmentSettings);

            //NOTE: With the base directory virtualized, packages cannot be installed from NuGet,
            //  only local packages and folders
            EnvironmentSettings.Host.VirtualizeDirectory(_paths.User.Content);
            EnvironmentSettings.Host.VirtualizeDirectory(_paths.User.Packages);
            _settingsLoader = (SettingsLoader)EnvironmentSettings.SettingsLoader;
            _hostDataLoader = new HostSpecificDataLoader(EnvironmentSettings.SettingsLoader);

            CommandLineParser parser = new CommandLineParser(args)
                .AddOptionWithConstrainedValue("--operation", new[]
                {
                        "list",
                        "create"
                })
                .AddOptionWithValue("--require")
                .AddOptionWithValue("--source");

            if (!parser.TryGetValues("--require", out IReadOnlyList<string> requireDirectives)
                || !parser.TryGetSingleValue("--operation", out string operation))
            {
                Console.SetOut(Console.Error);
                Console.WriteLine("ERROR: Expected \"--require\" and/or \"--operation\" parameter.");
                return -1;
            }

            IInstaller installer = new Installer(EnvironmentSettings);

            if (!parser.TryGetValues("--source", out IReadOnlyList<string> sources))
            {
                sources = null;
            }

            installer.InstallPackages(requireDirectives, sources?.ToList());

            //All required templates/components/lang packs have now been configured
            //Desired operation information starts at args[commandArgsStart]

            _templateCreator = new TemplateCreator(EnvironmentSettings);
            IReadOnlyList<TemplateInfo> rawTemplates = _settingsLoader.UserTemplateCache.TemplateInfo;

            var templates = new JArray();
            foreach (var rawTemplate in rawTemplates)
            {
                var template = JObject.FromObject(rawTemplate);
                template.Add("Parameters", JArray.FromObject(rawTemplate.Parameters));
                templates.Add(template);
            }


            if (string.Equals(operation, "list"))
            {
                Console.WriteLine(templates);
                return 0;
            }

            parser = parser.AddOptionWithValue("--identity");

            if (!parser.TryGetSingleValue("--identity", out string identity))
            {
                Console.SetOut(Console.Error);
                Console.WriteLine("ERROR: Expected \"--identity\" parameter.");
                return -1;
            }

            TemplateInfo info = rawTemplates.FirstOrDefault(x => string.Equals(x.Identity, identity, StringComparison.Ordinal));

            if (info == null)
            {
                Console.SetOut(Console.Error);
                Console.WriteLine("ERROR: Failed to find template with identity \"{0}\".", identity);
                return -1;
            }

            if (string.Equals(operation, "create"))
            {
                Dictionary<string, string> templateArgs = new Dictionary<string, string>(StringComparer.Ordinal);

                foreach (ITemplateParameter x in info.Parameters)
                {
                    if (x.DataType != null && x.DataType.StartsWith("bool", StringComparison.OrdinalIgnoreCase))
                    {
                        parser = parser.AddOptionWithBooleanValue($"--arg:{x.Name}", string.IsNullOrEmpty(x.DefaultValue) || string.Equals(x.DefaultValue, "true"));
                    }
                    else if (x.DataType != null && x.DataType.Equals("choice", StringComparison.OrdinalIgnoreCase))
                    {
                        parser = parser.AddOptionWithConstrainedValue($"--arg:{x.Name}", x.Choices.Keys.ToList());
                    }
                    else
                    {
                        parser = parser.AddOptionWithValue($"--arg:{x.Name}");
                    }

                    if (parser.TryGetSingleValue($"--arg:{x.Name}", out string val))
                    {
                        templateArgs[x.Name] = val;
                    }
                }

                TemplateCreationResult result = _templateCreator.InstantiateAsync(info, null, null, null, templateArgs, true, false, null).Result;
                if (result.Status == CreationResultStatus.Success)
                {
                    PostActionDispatcher postActionDispatcher = new PostActionDispatcher(EnvironmentSettings, result, AllowPostActionsSetting.Yes);
                    postActionDispatcher.Process(null);
                }

                Console.WriteLine(JObject.FromObject(result));
                return (int)result.Status;
            }

            return 0;
        }

        private static string GetHomeDirectory()
        {
            string home = "%USERPROFILE%";

            if (Path.DirectorySeparatorChar == '/')
            {
                home = "%HOME%";
            }

            string profileDir = Environment.ExpandEnvironmentVariables(home);
            return profileDir;
        }

        private static ITemplateEngineHost CreateHost(string hostIdentifier, string hostVersion)
        {
            Dictionary<string, string> preferences = new Dictionary<string, string>
            {
                { "prefs:language", DefaultLanguage }
            };

            AssemblyComponentCatalog builtIns = new AssemblyComponentCatalog(new[]
            {
                typeof(RunnableProjectGenerator).GetTypeInfo().Assembly,            // for assembly: Microsoft.TemplateEngine.Orchestrator.RunnableProjects
                typeof(NupkgInstallUnitDescriptorFactory).GetTypeInfo().Assembly,   // for assembly: Microsoft.TemplateEngine.Edge
                typeof(DotnetRestorePostActionProcessor).GetTypeInfo().Assembly     // for assembly: Microsoft.TemplateEngine.Cli
            });

            return new DefaultTemplateEngineHost(hostIdentifier, hostVersion, CultureInfo.CurrentCulture.Name, preferences, builtIns, new[] { "dotnetcli" });
        }
    }
}
