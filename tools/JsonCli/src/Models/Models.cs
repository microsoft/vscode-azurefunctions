/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

using System.Collections.Generic;
using Newtonsoft.Json;

namespace Microsoft.TemplateEngine.JsonCli.Models
{
    public class TemplateDescriptor
    {
        [JsonProperty("id")]
        public string Id { get; set; }

        [JsonProperty("isTemplateEngineTemplate")]
        public bool IsTemplateEngineTemplate { get; } = true;

        [JsonProperty("metadata")]
        public Metadata Metadata { get; set; }

        [JsonProperty("runtime")]
        public string Runtime { get; set; }
    }

    public class Metadata
    {
        [JsonProperty("defaultFunctionName")]
        public string DefaultFunctionName { get; set; }

        [JsonProperty("description")]
        public string Description { get; set; }

        [JsonProperty("name")]
        public string Name { get; set; }

        [JsonProperty("language")]
        public string Language { get; set; }

        [JsonProperty("category")]
        public List<string> Category { get; set; }

        [JsonProperty("categoryStyle")]
        public string CategoryStyle { get; set; }

        [JsonProperty("enabledInTryMode")]
        public bool EnabledInTryMode { get; set; }

        [JsonProperty("userPrompt")]
        public List<string> UserPrompt { get; set; }
    }

    public class FunctionDescriptor
    {

    }
}
