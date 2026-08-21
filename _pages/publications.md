---
layout: archive
title: "Publications"
permalink: /publications/
author_profile: true
research_map: true
---

My research foundation spans two complementary themes: **Statistical Machine Learning** and **Network and Graphical Models**. The map below highlights the thematic connections among individual works; select a node to jump to its entry.

{% include scholar-map.html %}

<p class="publication-author-note">(<sup aria-label="Corresponding author">&#42;</sup> Corresponding Author; <sup aria-label="Co-first author">&#35;</sup> Co-first Author; <sup aria-label="Authors listed in alphabetical order">&dagger;</sup> Authors listed in alphabetical order)</p>

{% assign publication_data = site.data.publications %}
{% assign stages = "manuscript,publication" | split: "," %}

{% for area in publication_data.areas %}
  <section class="publication-area" aria-labelledby="{{ area.id }}">
    <h2 id="{{ area.id }}">{{ area.title }}</h2>
    <p class="publication-area__description">{{ area.description }}</p>

    {% for stage in stages %}
      {% if stage == "manuscript" %}
        {% assign stage_heading = "Manuscripts" %}
      {% else %}
        {% assign stage_heading = "Publications" %}
      {% endif %}

      <h3>{{ stage_heading }}</h3>
      <ul class="publication-list">
        {% for work in publication_data.works %}
          {% if work.area == area.id and work.stage == stage %}
            <li id="{{ work.id }}" class="publication-item" data-stage="{{ work.stage }}" tabindex="-1">
              <span class="publication-item__title">{{ work.title }}</span><br>
              <span class="publication-item__authors">{{ work.authors_html }}</span><br>
              <span class="publication-item__details">{{ work.details_html }}</span>{% for link in work.links %} [<a href="{{ link.url }}">{{ link.label }}</a>]{% endfor %}
            </li>
          {% endif %}
        {% endfor %}
      </ul>
    {% endfor %}
  </section>
{% endfor %}
