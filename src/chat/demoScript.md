Hi all, here to give a quick demo of what we, the Azure extensions team, have done so far while experimenting with copilot extensibility

Our current thinking is that a good use of copilot extensibility would be helping users:
- Discover and suggest capabilities of the azure extensions based on the things they want to do
- Talk to copilot in a context which more azure extension/azure/specific azure service focused context
- Get help with errors that pop up while using azure extensions

So far our experimenting has more been focused on the first two: discover and suggesting capabilities, and better contexts

For the architecture of our experiment we've created an agent specific to one azure extension, azure functions, though we are also considering the possibility of a higher level "azure extensions agent" that could be more equipped to light up scenarios across multiple extensions

Ok so let's dive in

**show commands**

So here we have our "at agent", and as you can see we've implemented a variety of commands

We've made it so users are not requried to invoke commands directly however

Instead, if no command is specified, we feed a user's prompt directly to copilot along with information about available commands and we ask copilot itself to determine what command to be used, and from there we invoke it

Our two most simple commands are brainstorm and learn. These are focused on the first "good use", that is talking to copilot in a more focused context

So for example, I can ask our agent

@azure-functions how does azure functions compare to azure web apps?

So behind the scenese it likely invoke the learn command and now has given the user a nice focused response

For another example let's first look at how copilot handles this prompt without our agent:

I want to be able run code when my users upload new photos.

Ok so we get some sort of answer which looks pretty decent, but has nothing to do with azure or azure functions

However, if we give this same prompt to our agent, let's see what happens

@azure-functions I want to be able run code when my users upload new photos.

Now we get a response which is specific to azure functions, and we also get some nice follow ups which help the user continue further by actually creating an azure function project

With even more information from the user though, we can give an even more target reponse or followup, let's do the same promp, but also include from where users are uploading photos

@azure-functions I want to be able run code when my users upload new photos from my blazor app

Now our agent is not only able to suggest creating a project based off a template, it can also do so with a langauge it thinks the user might already now

However, as the followup implies, if we already know we want to make a function project, we can be more direct with the agent, for example with a prompt like this

@azure-functions create a function project that lets me run code when new photos are uploaded to my blob container from a react web app

Again, we get an appropriate template and language suggested, and just incase the user might prefer another language, we can also suggest a follow up to create a project with the same template in another language

Ok, I already have a blob trigger project open here, let's ask our agent to create a function app resource that I can deploy the project to

@azure-functions create a function app

Ok, so our agent knows the language of the current project and offers to start the process of creating a function app based on that

Again, let's see what happens if we can give it some more info though

@azure-functions create a function app in my test subscription, the app should be near london

Great, now the agent is able to infer and recommend even more information

It determined what subscription I wanted to use and a good region based for the app all based on my query


