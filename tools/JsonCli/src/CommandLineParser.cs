/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

using System;
using System.Collections.Generic;
using System.Linq;

namespace Microsoft.TemplateEngine.JsonCli
{
    public class CommandLineParser
    {
        private readonly HashSet<int> _consumedPositions = new HashSet<int>();
        private readonly Dictionary<string, string> _formCanonicalizations = new Dictionary<string, string>(StringComparer.Ordinal);
        private readonly Dictionary<string, List<string>> _values = new Dictionary<string, List<string>>(StringComparer.Ordinal);
        private readonly HashSet<string> _specifiedOptions = new HashSet<string>(StringComparer.Ordinal);

        public bool TryGetSingleValue(string key, out string value)
        {
            if (!TryGetValues(key, out IReadOnlyList<string> values) || values.Count != 1)
            {
                value = null;
                return false;
            }

            value = values[0];
            return true;
        }

        public bool TryGetValues(string key, out IReadOnlyList<string> values)
        {
            if (!_values.TryGetValue(key, out List<string> rawValues))
            {
                values = null;
                return false;
            }

            values = rawValues;
            return true;
        }

        public IReadOnlyList<string> Args { get; }

        public CommandLineParser(IReadOnlyList<string> args)
        {
            Args = args;
        }

        private CommandLineParser Clone()
        {
            CommandLineParser parser = new CommandLineParser(Args);
            parser._consumedPositions.UnionWith(_consumedPositions);

            foreach (KeyValuePair<string, string> canonicalization in _formCanonicalizations)
            {
                parser._formCanonicalizations[canonicalization.Key] = canonicalization.Value;
            }

            foreach (KeyValuePair<string, List<string>> valuePair in _values)
            {
                parser._values[valuePair.Key] = new List<string>(valuePair.Value);
            }

            parser._specifiedOptions.UnionWith(_specifiedOptions);
            return parser;
        }

        public CommandLineParser AddOptionWithValue(string basicForm, params string[] additionalForms)
        {
            CommandLineParser parser = Clone();
            parser._formCanonicalizations.Remove(basicForm);

            foreach (string form in additionalForms)
            {
                parser._formCanonicalizations[form] = basicForm;
            }

            for (int i = 0; i < Args.Count; ++i)
            {
                if (parser._consumedPositions.Contains(i)
                    || i == Args.Count - 1
                    || parser._consumedPositions.Contains(i + 1))
                {
                    continue;
                }

                if (string.Equals(Args[i], basicForm, StringComparison.Ordinal)
                    || additionalForms.Any(x => string.Equals(Args[i], x, StringComparison.Ordinal)))
                {
                    if (!parser._values.TryGetValue(basicForm, out List<string> bag))
                    {
                        bag = parser._values[basicForm] = new List<string>();
                    }

                    bag.Add(Args[i + 1]);

                    parser._specifiedOptions.Add(basicForm);
                    parser._consumedPositions.Add(i);
                    parser._consumedPositions.Add(i + 1);
                }
            }

            return parser;
        }

        public CommandLineParser AddOptionWithoutValue(string basicForm, string valueIfPresent, params string[] additionalForms)
        {
            CommandLineParser parser = Clone();
            parser._formCanonicalizations.Remove(basicForm);

            foreach (string form in additionalForms)
            {
                parser._formCanonicalizations[form] = basicForm;
            }

            for (int i = 0; i < Args.Count; ++i)
            {
                if (parser._consumedPositions.Contains(i))
                {
                    continue;
                }

                if (string.Equals(Args[i], basicForm, StringComparison.Ordinal)
                    || additionalForms.Any(x => string.Equals(Args[i], x, StringComparison.Ordinal)))
                {
                    if (!parser._values.TryGetValue(basicForm, out List<string> bag))
                    {
                        bag = parser._values[basicForm] = new List<string>();
                    }

                    bag.Add(valueIfPresent);
                    parser._specifiedOptions.Add(basicForm);
                    parser._consumedPositions.Add(i);
                }
            }

            return parser;
        }

        public CommandLineParser AddOptionWithBooleanValue(string basicForm, bool trueIfPresent, params string[] additionalForms)
        {
            return AddOptionWithConstrainedValue(basicForm, new[]
                {
                    "true",
                    "false"
                }, additionalForms)
                .AddOptionWithoutValue(basicForm, trueIfPresent
                    ? "true"
                    : "false", additionalForms);
        }

        public CommandLineParser AddOptionWithConstrainedValue(string basicForm, IReadOnlyCollection<string> allowedValues, params string[] additionalForms)
        {
            CommandLineParser parser = Clone();
            parser._formCanonicalizations.Remove(basicForm);

            foreach (string form in additionalForms)
            {
                parser._formCanonicalizations[form] = basicForm;
            }

            for (int i = 0; i < Args.Count; ++i)
            {
                if (parser._consumedPositions.Contains(i)
                    || i == Args.Count - 1
                    || parser._consumedPositions.Contains(i + 1))
                {
                    continue;
                }

                if (string.Equals(Args[i], basicForm, StringComparison.Ordinal)
                    || additionalForms.Any(x => string.Equals(Args[i], x, StringComparison.Ordinal)))
                {
                    if (!allowedValues.Contains(Args[i + 1]))
                    {
                        continue;
                    }

                    if (!parser._values.TryGetValue(basicForm, out List<string> bag))
                    {
                        bag = parser._values[basicForm] = new List<string>();
                    }

                    bag.Add(Args[i + 1]);

                    parser._specifiedOptions.Add(basicForm);
                    parser._consumedPositions.Add(i);
                    parser._consumedPositions.Add(i + 1);
                }
            }

            return parser;
        }
    }
}
