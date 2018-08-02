/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

using System;

namespace Microsoft.TemplateEngine.JsonCli
{
    internal class Package
    {
        public string Name { get; }

        public string Version { get; }

        public Package(string name, string version)
        {
            Name = name;
            Version = version;
        }

        public static bool TryParse(string spec, out Package package)
        {
            int index;
            if (string.IsNullOrEmpty(spec) || (index = spec.IndexOf("::", StringComparison.Ordinal)) < 0 || index == spec.Length - 1)
            {
                package = null;
                return false;
            }

            string name = spec.Substring(0, index);
            string version = spec.Substring(index + 2);

            package = new Package(name, version);
            return true;
        }
    }
}
